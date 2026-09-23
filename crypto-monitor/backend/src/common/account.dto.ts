export interface AccountBalance {
  currency: string;
  available: string;
  locked: string;
  avgBuyPrice: string;
  avgBuyPriceModified: boolean;
  unitCurrency: string;
}

export interface MarketQuote {
  market: string;
  price: number;
  timestamp: Date;
}
