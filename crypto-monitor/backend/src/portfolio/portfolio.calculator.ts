import Decimal from 'decimal.js';
import { AccountBalance } from '../common/account.dto';

const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export interface AssetPricing { price: string; markets: string[]; timestamps: Date[] }
export type PricingUnavailableReason = 'MARKET_LIST_UNAVAILABLE' | 'NO_SUPPORTED_MARKET' | 'QUOTE_UNAVAILABLE';

function output(value: Decimal, places?: number): number {
  const rounded = places === undefined ? value : value.toDecimalPlaces(places);
  if (!rounded.isFinite() || rounded.abs().greaterThan(Number.MAX_SAFE_INTEGER)) throw new Error('Portfolio value exceeds supported range');
  return rounded.toNumber();
}

export function hasHoldings(account: AccountBalance): boolean {
  return new D(account.available).plus(account.locked).greaterThan(0);
}

// Pure calculation: no network, persistence or logging; preserve decimals until JSON output.
export class PortfolioCalculator {
  calculate(accounts: AccountBalance[], prices: Map<string, AssetPricing>, accountsFetchedAt: Date,
    unavailableReasons: Map<string, PricingUnavailableReason> = new Map()) {
    const rows = accounts.filter(hasHoldings).map(account => {
      const balance = new D(account.available).plus(account.locked);
      const cash = account.currency === 'KRW';
      const pricing = prices.get(account.currency);
      const price = cash ? new D(1) : pricing ? new D(pricing.price) : null;
      if (price && (!price.isFinite() || price.lessThanOrEqualTo(0))) throw new Error('Invalid portfolio price');
      const valuation = price ? balance.times(price) : null;
      const avg = new D(account.avgBuyPrice);
      // An airdrop/transfer or missing cost basis is NOT automatically a 100% profit.
      // A BTC-denominated historical average cannot be converted using today's BTC rate.
      const knownCost = cash || (account.unitCurrency === 'KRW' && avg.greaterThan(0));
      const cost = cash ? balance : knownCost ? balance.times(avg) : null;
      const profit = valuation && cost ? valuation.minus(cost) : null;
      return { account, balance, pricing, cash, price, valuation, cost, profit };
    });
    const complete = rows.every(row => row.valuation !== null);
    const knownValue = rows.reduce((total, row) => total.plus(row.valuation ?? 0), new D(0));
    return {
      valuationComplete: complete,
      totalAssetKRW: complete ? output(knownValue, 2) : null,
      knownValueKRW: output(knownValue, 2),
      unpricedCurrencies: rows.filter(row => row.valuation === null).map(row => row.account.currency),
      accountsFetchedAt,
      calculatedAt: new Date(),
      assets: rows.map(row => ({
        currency: row.account.currency,
        balance: output(row.balance),
        availableBalance: output(new D(row.account.available)),
        locked: output(new D(row.account.locked)),
        avgBuyPrice: output(new D(row.account.avgBuyPrice)),
        avgBuyPriceCurrency: row.account.unitCurrency,
        avgBuyPriceModified: row.account.avgBuyPriceModified,
        costBasisStatus: row.cash ? 'CASH' : row.cost !== null ? 'AVAILABLE' : row.account.unitCurrency !== 'KRW' ? 'NON_KRW_COST_BASIS' : 'UNKNOWN',
        currentPrice: row.price === null ? null : output(row.price),
        valuation: row.valuation === null ? null : output(row.valuation, 2),
        costBasisKRW: row.cost === null ? null : output(row.cost, 2),
        profit: row.profit === null ? null : output(row.profit, 2),
        profitRate: row.profit !== null && row.cost !== null && row.cost.greaterThan(0) ? output(row.profit.div(row.cost).times(100), 4) : null,
        portfolioWeight: complete && knownValue.greaterThan(0) && row.valuation !== null ? output(row.valuation.div(knownValue).times(100), 4) : null,
        pricingStatus: row.cash ? 'CASH' : row.price === null ? 'UNAVAILABLE' : 'AVAILABLE',
        pricingUnavailableReason: row.price === null ? unavailableReasons.get(row.account.currency) ?? 'QUOTE_UNAVAILABLE' : null,
        pricingMarkets: row.pricing?.markets ?? [],
        priceTimestamps: row.pricing?.timestamps ?? [],
      })),
    };
  }
}
