import { Injectable } from '@nestjs/common';
import { BithumbRestClient } from '../bithumb/bithumb-rest.client';
import { normalizeMarket, parseCandleQuery } from '../common/market';

@Injectable()
export class MarketService {
  constructor(private readonly bithumb: BithumbRestClient) {}
  getMarkets() { return this.bithumb.getMarkets(); }
  getTicker(market: string) { return this.bithumb.getTicker(normalizeMarket(market)); }
  getCandles(market: string, timeframe?: unknown, limit?: unknown) {
    const query = parseCandleQuery(timeframe, limit);
    return this.bithumb.getCandles(normalizeMarket(market), query.timeframe, query.limit);
  }
}
