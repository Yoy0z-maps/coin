import { BadRequestException } from '@nestjs/common';

export function normalizeMarket(input: unknown): string {
  if (typeof input !== 'string') throw new BadRequestException('market must be a symbol or a market pair');
  const value = input.trim().toUpperCase();
  const market = value.includes('-') ? value : `KRW-${value}`;
  if (!/^(KRW|BTC)-[A-Z0-9]{1,30}$/.test(market) || market === 'BTC-BTC' || market === 'KRW-KRW') {
    throw new BadRequestException('market must use KRW or BTC as quote currency, for example KRW-BTC');
  }
  return market;
}

export const TIMEFRAMES = { '1m': 1, '5m': 5, '15m': 15, '1h': 60, '4h': 240, '1d': null } as const;
export type Timeframe = keyof typeof TIMEFRAMES;

export function parseCandleQuery(timeframe: unknown = '1h', limit: unknown = '100') {
  if (typeof timeframe !== 'string' || !Object.hasOwn(TIMEFRAMES, timeframe)) {
    throw new BadRequestException('timeframe must be one of 1m, 5m, 15m, 1h, 4h, 1d');
  }
  if (typeof limit !== 'string' || !/^[1-9]\d{0,2}$/.test(limit) || Number(limit) > 200) {
    throw new BadRequestException('limit must be an integer between 1 and 200');
  }
  return { timeframe: timeframe as Timeframe, limit: Number(limit) };
}
