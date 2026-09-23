import { BadRequestException, ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import Decimal from 'decimal.js';
import { normalizeMarket } from './market';

export function bodyObject(value: unknown, allowed: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('JSON object required');
  const result = value as Record<string, unknown>;
  if (Object.keys(result).some(key => !allowed.includes(key))) throw new BadRequestException('Unknown field');
  return result;
}
export function boolean(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new BadRequestException('Boolean required');
  return value;
}
export function id(value: string): string {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)) throw new BadRequestException('Invalid id');
  return value;
}
export function alertInput(value: unknown, patch = false) {
  const body = bodyObject(value, ['market', 'condition', 'targetPrice', 'enabled', 'triggerOnce', 'cooldownMinutes']);
  const result: { market?: string; condition?: 'ABOVE' | 'BELOW'; targetPrice?: string; enabled?: boolean; triggerOnce?: boolean; cooldownMinutes?: number } = {};
  if (!patch || 'market' in body) result.market = normalizeMarket(body.market);
  if (!patch || 'condition' in body) {
    if (body.condition !== 'ABOVE' && body.condition !== 'BELOW') throw new BadRequestException('condition must be ABOVE or BELOW');
    result.condition = body.condition;
  }
  if (!patch || 'targetPrice' in body) {
    const value = body.targetPrice;
    if ((typeof value !== 'number' && typeof value !== 'string') || String(value).length > 40) throw new BadRequestException('Invalid targetPrice');
    let price: Decimal;
    try { price = new Decimal(value); } catch { throw new BadRequestException('Invalid targetPrice'); }
    if (!price.isFinite() || price.lte(0) || price.gt('1000000000000000') || price.decimalPlaces() > 10) throw new BadRequestException('targetPrice must be positive, <= 1e15 and have <= 10 decimals');
    result.targetPrice = price.toFixed();
  }
  for (const key of ['enabled', 'triggerOnce'] as const) if (key in body) result[key] = boolean(body[key]);
  if ('cooldownMinutes' in body) {
    if (typeof body.cooldownMinutes !== 'number' || !Number.isInteger(body.cooldownMinutes) || body.cooldownMinutes < 1 || body.cooldownMinutes > 10080) throw new BadRequestException('cooldownMinutes must be 1–10080');
    result.cooldownMinutes = body.cooldownMinutes;
  }
  if (patch && !Object.keys(result).length) throw new BadRequestException('At least one field is required');
  return result;
}
export function dbError(error: unknown): never {
  const code = (error as {code?: string})?.code;
  if (code === 'P2002') throw new ConflictException('Market already exists in watchlist');
  if (code === 'P2025') throw new NotFoundException('Record not found');
  throw new ServiceUnavailableException('Application database request failed');
}
