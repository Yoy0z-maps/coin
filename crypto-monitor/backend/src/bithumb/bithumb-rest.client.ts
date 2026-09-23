import { BadGatewayException, BadRequestException, GatewayTimeoutException, Inject, Injectable, Logger, NotFoundException, Optional, ServiceUnavailableException } from '@nestjs/common';
import { setTimeout as delay } from 'node:timers/promises';
import { normalizeMarket, Timeframe, TIMEFRAMES } from '../common/market';
import { Candle, MarketInfo, MarketTicker } from '../common/market.dto';
import { mapCandles, mapMarkets, mapRollingChange, mapTicker } from './bithumb.mapper';
import { BithumbAuthService } from './bithumb-auth.service';
import { mapAccounts, mapQuotes } from './bithumb-account.mapper';
import { AccountBalance, MarketQuote } from '../common/account.dto';

export const BITHUMB_FETCH = Symbol('BITHUMB_FETCH');
export const BITHUMB_HTTP_OPTIONS = Symbol('BITHUMB_HTTP_OPTIONS');
export interface HttpOptions { timeoutMs: number; intervalMs: number; maxQueueMs: number }

@Injectable()
export class BithumbRestClient {
  private readonly logger = new Logger(BithumbRestClient.name);
  private nextStart = 0;
  private blockedUntil = 0;

  constructor(
    @Inject(BITHUMB_FETCH) private readonly fetcher: typeof fetch,
    @Inject(BITHUMB_HTTP_OPTIONS) private readonly options: HttpOptions,
    @Optional() private readonly auth?: BithumbAuthService,
  ) {}

  async getAccounts(): Promise<AccountBalance[]> {
    return this.get('/v1/accounts', {}, mapAccounts, true);
  }

  async getQuotes(inputs: string[]): Promise<MarketQuote[]> {
    if (inputs.length < 1 || inputs.length > 20) throw new BadRequestException('Quote batch must contain 1 to 20 markets');
    const markets = [...new Set(inputs.map(normalizeMarket))];
    return this.get('/v1/ticker', { markets: markets.join(',') }, data => mapQuotes(data, markets));
  }

  async getMarkets(): Promise<MarketInfo[]> {
    return this.get('/v1/market/all', { isDetails: 'true' }, mapMarkets);
  }

  async getTicker(input: string): Promise<MarketTicker> {
    const market = normalizeMarket(input);
    const ticker = await this.get('/v1/ticker', { markets: market }, data => mapTicker(data, market));
    const [quote, base] = market.split('-');
    try {
      return { ...ticker, ...await this.get(`/public/ticker/${base}_${quote}`, {}, mapRollingChange) };
    } catch {
      // Supplementary 24h data must not hide a valid primary ticker or be fabricated.
      return ticker;
    }
  }

  async getCandles(input: string, timeframe: Timeframe, limit: number): Promise<Candle[]> {
    const market = normalizeMarket(input);
    if (!Object.hasOwn(TIMEFRAMES, timeframe) || !Number.isInteger(limit) || limit < 1 || limit > 200) {
      throw new BadRequestException('Invalid candle timeframe or limit');
    }
    const unit = TIMEFRAMES[timeframe];
    const path = unit === null ? '/v1/candles/days' : `/v1/candles/minutes/${unit}`;
    return this.get(path, { market, count: String(limit) }, data => mapCandles(data, market, unit, limit));
  }

  private async acquire(): Promise<void> {
    const now = Date.now();
    if (now < this.blockedUntil) throw new ServiceUnavailableException('Bithumb rate limit active; retry later');
    const start = Math.max(now, this.nextStart);
    if (start - now > this.options.maxQueueMs) throw new ServiceUnavailableException('Market request queue full; retry later');
    this.nextStart = start + this.options.intervalMs;
    if (start > now) await delay(start - now);
    if (Date.now() < this.blockedUntil) throw new ServiceUnavailableException('Bithumb rate limit active; retry later');
  }

  private async get<T>(path: string, query: Record<string, string>, decode: (value: unknown) => T, authenticate = false): Promise<T> {
    await this.acquire();
    const url = new URL(path, 'https://api.bithumb.com');
    url.search = new URLSearchParams(query).toString();
    const headers: Record<string, string> = { accept: 'application/json' };
    if (authenticate) {
      if (path !== '/v1/accounts' || Object.keys(query).length) throw new BadGatewayException('Unsupported private request');
      if (!this.auth) throw new ServiceUnavailableException('Bithumb authentication is unavailable');
      // Sign after queueing: each account request gets a fresh nonce and timestamp.
      headers.Authorization = this.auth.createAccountsAuthorization();
    }
    const signal = AbortSignal.timeout(this.options.timeoutMs);
    let response: Response;
    try {
      // Fixed official origin, GET only; authorization is exclusive to /v1/accounts.
      response = await this.fetcher(url, { method: 'GET', headers, redirect: 'error', signal });
    } catch {
      this.logger.warn('Bithumb REST request failed: transport');
      if (signal.aborted) throw new GatewayTimeoutException('Bithumb request timed out');
      throw new BadGatewayException('Bithumb is unavailable');
    }
    if (!response.ok) {
      // Never log the external response body, thrown error, environment, or headers.
      this.logger.warn(`Bithumb REST request failed: HTTP ${response.status}`);
      if (authenticate && [401, 403].includes(response.status)) {
        let code = 'BITHUMB_AUTH_REJECTED';
        try {
          const body = await response.json() as { error?: { name?: unknown } };
          const names: Record<string, string> = {
            NotAllowIP: 'BITHUMB_IP_NOT_ALLOWED', out_of_scope: 'BITHUMB_READ_PERMISSION_REQUIRED',
            expired_jwt: 'BITHUMB_TOKEN_EXPIRED', jwt_verification: 'BITHUMB_SIGNATURE_REJECTED',
          };
          if (typeof body?.error?.name === 'string' && Object.hasOwn(names, body.error.name)) code = names[body.error.name];
        } catch { /* Never expose authentication response details. */ }
        throw new ServiceUnavailableException({ code, message: 'Check Bithumb credentials, account-read permission, registered IP and system clock' });
      }
      await response.body?.cancel().catch(() => undefined);
      if (response.status === 429) {
        const retry = Number(response.headers.get('retry-after'));
        this.blockedUntil = Date.now() + (Number.isFinite(retry) && retry > 0 ? Math.min(retry, 60) : 5) * 1000;
        throw new ServiceUnavailableException('Bithumb rate limit active; retry later');
      }
      if (authenticate) throw new BadGatewayException('Bithumb account request failed');
      if (response.status === 404) throw new NotFoundException('Market data not found');
      if (response.status === 400) throw new BadRequestException('Bithumb rejected the market request');
      throw new BadGatewayException('Bithumb is unavailable');
    }
    try {
      return decode(await response.json());
    } catch {
      this.logger.warn('Bithumb REST request failed: invalid or incomplete response');
      if (signal.aborted) throw new GatewayTimeoutException('Bithumb request timed out');
      throw new BadGatewayException('Invalid Bithumb response');
    }
  }
}
