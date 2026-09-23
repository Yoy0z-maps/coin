import { AccountBalance, MarketQuote } from '../common/account.dto';
import { object } from './bithumb.mapper';

function invalid(): never { throw new Error('Invalid Bithumb account or quote response'); }
function symbol(value: unknown): string {
  return typeof value === 'string' && /^[A-Z0-9]{1,30}$/.test(value) ? value : invalid();
}
function decimal(value: unknown): string {
  return typeof value === 'string' && /^\d+(\.\d+)?$/.test(value) && value.length <= 100 ? value : invalid();
}

export function mapAccounts(value: unknown): AccountBalance[] {
  if (!Array.isArray(value)) return invalid();
  const seen = new Set<string>();
  return value.map(item => {
    const row = object(item);
    const currency = symbol(row.currency);
    if (seen.has(currency) || typeof row.avg_buy_price_modified !== 'boolean') return invalid();
    seen.add(currency);
    return { currency, available: decimal(row.balance), locked: decimal(row.locked),
      avgBuyPrice: decimal(row.avg_buy_price), avgBuyPriceModified: row.avg_buy_price_modified,
      unitCurrency: symbol(row.unit_currency) };
  });
}

export function mapQuotes(value: unknown, expected: string[]): MarketQuote[] {
  if (!Array.isArray(value) || value.length !== expected.length) return invalid();
  const remaining = new Set(expected);
  return value.map(item => {
    const row = object(item);
    if (typeof row.market !== 'string' || !remaining.delete(row.market) || typeof row.trade_price !== 'number' ||
        !Number.isFinite(row.trade_price) || row.trade_price <= 0) return invalid();
    if (!(typeof row.timestamp === 'number' || (typeof row.timestamp === 'string' && /^\d+$/.test(row.timestamp)))) return invalid();
    const time = Number(row.timestamp);
    const timestamp = new Date(time);
    if (!Number.isSafeInteger(time) || time <= 0 || !Number.isFinite(timestamp.getTime())) return invalid();
    return { market: row.market, price: row.trade_price, timestamp };
  });
}
