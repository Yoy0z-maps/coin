import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PriceAlert } from '@prisma/client';
import { Subject } from 'rxjs';
import { DatabaseService } from '../database/database.service';

export function subscriptionUnion(watchlist: {market: string; enabled: boolean}[], alerts: {market: string; enabled: boolean}[]): string[] {
  return [...new Set([...watchlist, ...alerts].filter(row => row.enabled).map(row => row.market))].sort();
}

@Injectable()
export class StateCache implements OnModuleInit, OnModuleDestroy {
  readonly changes = new Subject<void>();
  markets: string[] = [];
  alerts = new Map<string, PriceAlert[]>();
  healthy = false;
  private tail: Promise<void> = Promise.resolve();
  private timer?: NodeJS.Timeout;
  private readonly logger = new Logger(StateCache.name);
  constructor(private readonly db: DatabaseService) {}
  async onModuleInit() {
    await this.refresh().catch(() => undefined);
    this.timer = setInterval(() => { void this.refresh().catch(() => undefined); }, 30000);
  }
  onModuleDestroy() { clearInterval(this.timer); this.changes.complete(); }
  refresh(): Promise<void> {
    this.tail = this.tail.catch(() => undefined).then(async () => {
      try {
        const [watch, alerts] = await this.db.$transaction([
          this.db.watchlist.findMany({ where: { enabled: true } }),
          this.db.priceAlert.findMany({ where: { enabled: true } }),
        ], { isolationLevel: 'RepeatableRead' });
        const cache = new Map<string, PriceAlert[]>();
        for (const alert of alerts) cache.set(alert.market, [...(cache.get(alert.market) ?? []), alert]);
        this.markets = subscriptionUnion(watch, alerts);
        this.alerts = cache;
        this.healthy = true;
        this.changes.next();
      } catch {
        this.healthy = false;
        this.logger.warn('Monitoring configuration refresh failed; retaining last cache');
        throw new Error('Monitoring configuration unavailable');
      }
    });
    return this.tail;
  }
}
