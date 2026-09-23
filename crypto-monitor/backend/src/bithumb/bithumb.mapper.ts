import { Candle, MarketInfo, MarketTicker } from '../common/market.dto';

// Runtime checks belong at the exchange boundary; never trust a TS type assertion on JSON.
function invalid(): never { throw new Error('Invalid Bithumb response'); }
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
}
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : invalid(); }
function text(value: unknown): string { return typeof value === 'string' && value.length > 0 ? value : invalid(); }
function number(value: unknown, signed = false): number {
  if (typeof value !== 'number' && !(typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value))) return invalid();
  const result = Number(value);
  return Number.isFinite(result) && (signed || result >= 0) ? result : invalid();
}
function milliseconds(value: unknown): Date {
  const time = number(value);
  const date = new Date(time);
  return Number.isSafeInteger(time) && time > 0 && Number.isFinite(date.getTime()) ? date : invalid();
}
function market(value: unknown): string {
  const result = text(value);
  return /^(KRW|BTC)-[A-Z0-9]{1,30}$/.test(result) ? result : invalid();
}

export function mapMarkets(value: unknown): MarketInfo[] {
  return array(value).map(value => {
    const row = object(value);
    if (row.market_warning !== 'NONE' && row.market_warning !== 'CAUTION') return invalid();
    return { market: market(row.market), koreanName: text(row.korean_name), englishName: text(row.english_name), warning: row.market_warning };
  });
}

export function mapTicker(value: unknown, expectedMarket: string): MarketTicker {
  const rows = array(value);
  if (rows.length !== 1) return invalid();
  const row = object(rows[0]);
  if (market(row.market) !== expectedMarket) return invalid();
  return {
    market: expectedMarket,
    price: number(row.trade_price),
    changeRate: number(row.signed_change_rate, true),
    changeRateBasis: 'PREVIOUS_CLOSE_KST',
    previousClose: number(row.prev_closing_price),
    highToday: number(row.high_price),
    lowToday: number(row.low_price),
    volume24h: number(row.acc_trade_volume_24h),
    tradeValue24h: number(row.acc_trade_price_24h),
    timestamp: milliseconds(row.timestamp),
    change24h: null,
    change24hTimestamp: null,
  };
}

export function mapRollingChange(value: unknown): Pick<MarketTicker, 'change24h' | 'change24hTimestamp'> {
  const envelope = object(value);
  if (envelope.status !== '0000') return invalid();
  const row = object(envelope.data);
  return { change24h: number(row.fluctate_rate_24H, true), change24hTimestamp: milliseconds(row.date) };
}

export function mapCandles(value: unknown, expectedMarket: string, unit: number | null, limit: number): Candle[] {
  const rows = array(value);
  if (rows.length > limit) return invalid();
  const seen = new Set<number>();
  const candles = rows.map(value => {
    const row = object(value);
    if (market(row.market) !== expectedMarket || (unit !== null && row.unit !== unit)) return invalid();
    const utc = text(row.candle_date_time_utc);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(utc)) return invalid();
    const timestamp = new Date(`${utc}Z`);
    if (!Number.isFinite(timestamp.getTime()) || timestamp.toISOString() !== `${utc}.000Z` || seen.has(timestamp.getTime())) return invalid();
    seen.add(timestamp.getTime());
    const candle = {
      timestamp, open: number(row.opening_price), high: number(row.high_price),
      low: number(row.low_price), close: number(row.trade_price), volume: number(row.candle_acc_trade_volume),
    };
    if (candle.high < Math.max(candle.open, candle.close, candle.low) || candle.low > Math.min(candle.open, candle.close)) return invalid();
    return candle;
  });
  return candles.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}
