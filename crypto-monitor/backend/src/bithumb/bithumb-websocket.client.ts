import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import WebSocket from 'ws';
import { Subject, Subscription } from 'rxjs';
import { StateCache } from '../state/state-cache.service';

export interface LiveTicker {
  market: string; price: number; changeRate: number; volume24h: number;
  timestamp: string; receivedAt: string; streamType: 'SNAPSHOT' | 'REALTIME';
}
export function mapLiveTicker(value: unknown): LiveTicker | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (row.type !== 'ticker' || typeof row.code !== 'string' || !/^(KRW|BTC)-[A-Z0-9]{1,30}$/.test(row.code) ||
      typeof row.trade_price !== 'number' || !Number.isFinite(row.trade_price) || row.trade_price <= 0 ||
      typeof row.signed_change_rate !== 'number' || !Number.isFinite(row.signed_change_rate) ||
      typeof row.acc_trade_volume_24h !== 'number' || !Number.isFinite(row.acc_trade_volume_24h) || row.acc_trade_volume_24h < 0 ||
      typeof row.timestamp !== 'number' || !Number.isSafeInteger(row.timestamp) || row.timestamp <= 0 ||
      !['SNAPSHOT', 'REALTIME'].includes(String(row.stream_type))) return null;
  const date = new Date(row.timestamp);
  if (!Number.isFinite(date.getTime())) return null;
  return { market: row.code, price: row.trade_price, changeRate: row.signed_change_rate, volume24h: row.acc_trade_volume_24h,
    timestamp: date.toISOString(), receivedAt: new Date().toISOString(), streamType: row.stream_type as LiveTicker['streamType'] };
}
export function reconnectDelay(attempt: number) { return Math.min(30000, 1000 * 2 ** Math.min(attempt, 5)); }
export const WS_FACTORY = Symbol('WS_FACTORY');

@Injectable()
export class BithumbWebSocketClient implements OnModuleInit, OnModuleDestroy {
  readonly tickers = new Subject<LiveTicker>();
  private readonly logger = new Logger(BithumbWebSocketClient.name);
  private socket?: WebSocket;
  private timer?: NodeJS.Timeout;
  private heartbeat?: NodeJS.Timeout;
  private changes?: Subscription;
  private stopped = false;
  private connecting = false;
  private signature = '';
  private attempts = 0;
  private alive = true;
  private latest = new Map<string, LiveTicker>();
  private status: 'idle' | 'connecting' | 'connected' | 'reconnecting' = 'idle';
  private lastMessageAt: string | null = null;
  private receivedCount = 0;
  private reconnectCount = 0;
  constructor(private readonly cache: StateCache,
    @Optional() @Inject(WS_FACTORY) private readonly factory: (url: string) => WebSocket = url => new WebSocket(url, { handshakeTimeout: 10000, maxPayload: 1024 * 1024, perMessageDeflate: false })) {}

  onModuleInit() {
    this.changes = this.cache.changes.subscribe(() => this.configurationChanged());
    this.configurationChanged();
  }
  onModuleDestroy() {
    this.stopped = true;
    clearTimeout(this.timer); clearInterval(this.heartbeat); this.changes?.unsubscribe();
    this.socket?.terminate(); this.tickers.complete();
  }
  snapshot() {
    return { status: this.status, subscriptions: [...this.cache.markets], cacheHealthy: this.cache.healthy,
      lastMessageAt: this.lastMessageAt, receivedCount: this.receivedCount, reconnectCount: this.reconnectCount,
      activeAlertCount: [...this.cache.alerts.values()].reduce((count, rows) => count + rows.length, 0),
      notificationEngineEnabled: Boolean(process.env.DISCORD_WEBHOOK_URL), tickers: [...this.latest.values()] };
  }
  private configurationChanged() {
    const signature = this.cache.markets.join(',');
    if (signature === this.signature && (this.socket || this.timer || this.connecting)) return;
    this.signature = signature;
    for (const market of this.latest.keys()) if (!this.cache.markets.includes(market)) this.latest.delete(market);
    // Replace the connection to make unsubscription unambiguous; never overlap sockets.
    if (this.socket) { this.socket.terminate(); return; }
    if (!this.connecting) { clearTimeout(this.timer); this.timer = undefined; this.schedule(300); }
  }
  private schedule(ms: number) {
    if (this.stopped || this.timer) return;
    if (!this.cache.markets.length) { this.status = 'idle'; return; }
    this.status = this.attempts ? 'reconnecting' : 'connecting';
    this.timer = setTimeout(() => { this.timer = undefined; void this.connect(); }, ms);
  }
  private async connect() {
    if (this.stopped || this.socket || this.connecting) return;
    this.connecting = true;
    await this.cache.refresh().catch(() => undefined);
    this.connecting = false;
    if (this.stopped) return;
    const markets = [...this.cache.markets];
    this.signature = markets.join(',');
    if (!markets.length) { this.status = 'idle'; return; }
    this.status = this.attempts ? 'reconnecting' : 'connecting';
    let ws: WebSocket;
    try { ws = this.factory('wss://ws-api.bithumb.com/websocket/v1'); }
    catch { this.logger.warn('WebSocket initialization failed'); this.schedule(reconnectDelay(this.attempts++)); return; }
    this.socket = ws;
    ws.on('open', () => {
      if (this.stopped || this.socket !== ws) { ws.terminate(); return; }
      this.status = 'connected'; this.alive = true;
      if (this.attempts) this.reconnectCount++;
      this.logger.log(this.attempts ? 'WebSocket reconnected' : 'WebSocket connected');
      ws.send(JSON.stringify([{ ticket: randomUUID() }, { type: 'ticker', codes: markets }, { format: 'DEFAULT' }]));
      this.logger.log(`Subscription updated: ${markets.length} markets`);
      this.heartbeat = setInterval(() => {
        if (!this.alive) { ws.terminate(); return; }
        this.alive = false;
        if (ws.readyState === WebSocket.OPEN) ws.ping();
      }, 25000);
    });
    ws.on('pong', () => { this.alive = true; });
    ws.on('message', data => {
      try {
        const value = JSON.parse(data.toString());
        if (value.error) { this.logger.warn('WebSocket subscription rejected'); ws.terminate(); return; }
        const ticker = mapLiveTicker(value);
        if (!ticker || !this.cache.markets.includes(ticker.market)) return;
        const previous = this.latest.get(ticker.market);
        if (previous && ticker.timestamp < previous.timestamp) return;
        this.attempts = 0; this.receivedCount++; this.lastMessageAt = ticker.receivedAt;
        this.latest.set(ticker.market, ticker); this.tickers.next(ticker);
      } catch { this.logger.warn('Invalid WebSocket message discarded'); }
    });
    ws.on('error', () => { this.logger.warn('WebSocket connection error'); ws.terminate(); });
    ws.on('close', () => {
      if (this.socket !== ws) return;
      this.socket = undefined; clearInterval(this.heartbeat);
      if (this.stopped) return;
      this.logger.warn('WebSocket disconnected');
      const ms = reconnectDelay(this.attempts++);
      this.logger.log(`WebSocket reconnecting in ${ms}ms`);
      this.schedule(ms);
    });
  }
}
