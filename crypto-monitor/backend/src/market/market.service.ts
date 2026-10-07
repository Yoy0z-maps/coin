import { IndicatorService } from '../indicator/indicator.service';
import { Injectable } from '@nestjs/common';
import { BithumbRestClient } from '../bithumb/bithumb-rest.client';
import { normalizeMarket, parseCandleQuery } from '../common/market';

@Injectable()
export class MarketService {
  constructor(private readonly bithumb: BithumbRestClient, private readonly indicator: IndicatorService) {}
  async getAnalysis(input: string, timeframe?: unknown) {
    const market=normalizeMarket(input), query=parseCandleQuery(timeframe,'200');
    const [ticker,candles]=await Promise.all([this.bithumb.getTicker(market),this.bithumb.getCandles(market,query.timeframe,200)]);
    const generatedAt=new Date();
    return {market,timeframe:query.timeframe,price:ticker.price,priceTimestamp:ticker.timestamp,change24h:ticker.change24h,highToday:ticker.highToday,lowToday:ticker.lowToday,highLowBasis:'CURRENT_DAY',generatedAt,...this.indicator.analyze(candles,query.timeframe,generatedAt)};
  }
  getMarkets() { return this.bithumb.getMarkets(); }
  getTicker(market: string) { return this.bithumb.getTicker(normalizeMarket(market)); }
  getCandles(market: string, timeframe?: unknown, limit?: unknown) {
    const query = parseCandleQuery(timeframe, limit);
    return this.bithumb.getCandles(normalizeMarket(market), query.timeframe, query.limit);
  }
}
