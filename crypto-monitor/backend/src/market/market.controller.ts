import { Controller, Get, Param, Query } from '@nestjs/common';
import { MarketService } from './market.service';

@Controller()
export class MarketController {
  constructor(private readonly market: MarketService) {}
  @Get('market/:market/analysis')
  getAnalysis(@Param('market') market: string, @Query('timeframe') timeframe?: unknown) { return this.market.getAnalysis(market,timeframe); }

  @Get('markets')
  getMarkets() { return this.market.getMarkets(); }

  @Get('market/:market/ticker')
  getTicker(@Param('market') market: string) { return this.market.getTicker(market); }

  @Get('market/:market/candles')
  getCandles(@Param('market') market: string, @Query('timeframe') timeframe?: unknown, @Query('limit') limit?: unknown) {
    return this.market.getCandles(market, timeframe, limit);
  }
}
