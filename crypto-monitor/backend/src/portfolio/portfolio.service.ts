import { BadGatewayException, Injectable } from '@nestjs/common';
import Decimal from 'decimal.js';
import { BithumbRestClient } from '../bithumb/bithumb-rest.client';
import { MarketQuote } from '../common/account.dto';
import { AssetPricing, hasHoldings, PortfolioCalculator, PricingUnavailableReason } from './portfolio.calculator';

const D = Decimal.clone({ precision: 40 });

@Injectable()
export class PortfolioService {
  constructor(private readonly bithumb: BithumbRestClient, private readonly calculator: PortfolioCalculator) {}

  async getPortfolio() {
    // Fail account/authentication errors explicitly; never report an empty wallet on failure.
    const accounts = await this.bithumb.getAccounts();
    const accountsFetchedAt = new Date();
    const coins = accounts.filter(account => account.currency !== 'KRW' && hasHoldings(account));
    const prices = new Map<string, AssetPricing>();
    const unavailableReasons = new Map<string, PricingUnavailableReason>();
    if (coins.length) {
      let markets = new Set<string>();
      let marketListAvailable = false;
      try {
        markets = new Set((await this.bithumb.getMarkets()).map(row => row.market));
        marketListAvailable = true;
      }
      catch { /* Cash and account balances remain available; total will be marked incomplete. */ }
      const routes = new Map<string, string[]>();
      for (const account of coins) {
        const direct = `KRW-${account.currency}`;
        const viaBtc = `BTC-${account.currency}`;
        if (markets.has(direct)) routes.set(account.currency, [direct]);
        else if (markets.has(viaBtc) && markets.has('KRW-BTC')) routes.set(account.currency, [viaBtc, 'KRW-BTC']);
        else unavailableReasons.set(account.currency, marketListAvailable ? 'NO_SUPPORTED_MARKET' : 'MARKET_LIST_UNAVAILABLE');
      }
      const requested = [...new Set([...routes.values()].flat())];
      const quotes = new Map<string, MarketQuote>();
      for (let i = 0; i < requested.length; i += 20) {
        try {
          for (const quote of await this.bithumb.getQuotes(requested.slice(i, i + 20))) quotes.set(quote.market, quote);
        } catch { /* Unknown valuations stay null, not zero; no recursive retries. */ }
      }
      for (const [currency, route] of routes) {
        const legs = route.map(market => quotes.get(market));
        if (legs.every((leg): leg is MarketQuote => leg !== undefined)) {
          prices.set(currency, {
            price: legs.reduce((price, leg) => price.times(leg.price), new D(1)).toString(),
            markets: route, timestamps: legs.map(leg => leg.timestamp),
          });
        } else unavailableReasons.set(currency, 'QUOTE_UNAVAILABLE');
      }
    }
    try { return this.calculator.calculate(accounts, prices, accountsFetchedAt, unavailableReasons); }
    catch { throw new BadGatewayException('Portfolio data could not be calculated'); }
  }
}
