import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PriceAlert, Prisma } from '@prisma/client';
import { Subscription } from 'rxjs';
import { DatabaseService } from '../database/database.service';
import { StateCache } from '../state/state-cache.service';
import { BithumbWebSocketClient, LiveTicker } from '../bithumb/bithumb-websocket.client';
import { NOTIFICATION_PROVIDER, NotificationProvider } from '../notification/notification.provider';
import { ENVIRONMENT } from '../config/config.module';
import { Environment } from '../config/environment';
export function eligible(alert: PriceAlert, price: number, now: Date): boolean {
  if (!alert.enabled || !Number.isFinite(price) || price <= 0) return false;
  if (alert.lastTriggeredAt && (alert.triggerOnce || now.getTime() - alert.lastTriggeredAt.getTime() < alert.cooldownMinutes * 60000)) return false;
  const value = new Prisma.Decimal(price);
  return alert.condition === 'ABOVE' ? value.gte(alert.targetPrice) : value.lte(alert.targetPrice);
}
export function alertMessage(alert: PriceAlert, ticker: LiveTicker, now: Date) {
  const quote = alert.market.split('-')[0];
  return { content: `🔔 ${alert.market} 가격 알림\n\n설정 가격 ${alert.condition === 'ABOVE' ? '이상' : '이하'}에 도달했습니다.\n현재가: ${ticker.price.toLocaleString('ko-KR', { maximumFractionDigits: 10 })} ${quote}\n설정가: ${alert.targetPrice.toString()} ${quote}\n전일 종가 대비: ${(ticker.changeRate * 100).toFixed(2)}%\n시간: ${now.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false })} KST` };
}
@Injectable()
export class AlertEngine implements OnModuleInit, OnModuleDestroy {
  private subscription?: Subscription;
  private busy = new Set<string>();
  private blockedUntil = new Map<string, number>();
  private readonly logger = new Logger(AlertEngine.name);
  constructor(private readonly db: DatabaseService, private readonly cache: StateCache, private readonly ws: BithumbWebSocketClient,
    @Inject(NOTIFICATION_PROVIDER) private readonly notifications: NotificationProvider, @Inject(ENVIRONMENT) private readonly env: Environment) {}
  onModuleInit() { this.subscription = this.ws.tickers.subscribe(t => this.onTicker(t)); }
  onModuleDestroy() { this.subscription?.unsubscribe(); }
  onTicker(ticker: LiveTicker) {
    const now = new Date();
    // Stale exchange snapshots must not trigger a new alert after reconnect.
    const age = now.getTime() - Date.parse(ticker.timestamp);
    if (!this.env.discordWebhookUrl || !Number.isFinite(age) || age > 60000 || age < -5000) return;
    for (const [key, until] of this.blockedUntil) if (until <= now.getTime()) this.blockedUntil.delete(key);
    for (const alert of this.cache.alerts.get(ticker.market) ?? []) {
      if (this.busy.has(alert.id) || (this.blockedUntil.get(alert.id) ?? 0) > now.getTime() || !eligible(alert, ticker.price, now)) continue;
      this.busy.add(alert.id);
      void this.trigger(alert, ticker, now).catch(() => {
        this.blockedUntil.set(alert.id, Date.now() + 30000);
        this.logger.warn('Alert processing failed; retry delayed');
      }).finally(() => this.busy.delete(alert.id));
    }
  }
  private async trigger(alert: PriceAlert, ticker: LiveTicker, now: Date) {
    // Claim and history are atomic. CAS rejects stale cache entries and concurrent claims.
    const log = await this.db.$transaction(async tx => {
      const claim = await tx.priceAlert.updateMany({ where: { id: alert.id, enabled: true, updatedAt: alert.updatedAt, lastTriggeredAt: alert.lastTriggeredAt }, data: { lastTriggeredAt: now, enabled: !alert.triggerOnce } });
      if (!claim.count) return null;
      return tx.priceAlertLog.create({ data: { alertId: alert.id, market: alert.market, targetPrice: alert.targetPrice, triggerPrice: ticker.price, condition: alert.condition, triggeredAt: now, notificationStatus: 'PENDING' } });
    });
    if (!log) { this.blockedUntil.set(alert.id, Date.now() + 30000); await this.cache.refresh().catch(() => undefined); return; }
    alert.lastTriggeredAt = now; if (alert.triggerOnce) alert.enabled = false;
    this.logger.log('Alert triggered');
    void this.cache.refresh().catch(() => undefined);
    let status: 'SENT' | 'FAILED' = 'SENT';
    try { await this.notifications.send(alertMessage(alert, ticker, now)); } catch { status = 'FAILED'; }
    // Never retry ambiguous deliveries automatically: avoid duplicate mobile messages.
    await this.db.priceAlertLog.update({ where: { id: log.id }, data: { notificationStatus: status } });
  }
}
