export interface MarketInfo {
  market: string;
  koreanName: string;
  englishName: string;
  warning: 'NONE' | 'CAUTION';
}

export interface MarketTicker {
  market: string;
  price: number;
  /** Signed ratio vs previous close at KST midnight; 0.01 means +1%. */
  changeRate: number;
  changeRateBasis: 'PREVIOUS_CLOSE_KST';
  previousClose: number;
  highToday: number;
  lowToday: number;
  volume24h: number;
  tradeValue24h: number;
  timestamp: Date;
  /** Rolling 24h percent from the legacy public ticker, not changeRate * 100. */
  change24h: number | null;
  change24hTimestamp: Date | null;
}

export interface Candle {
  /** Start of the candle, not the time of its last trade. */
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
