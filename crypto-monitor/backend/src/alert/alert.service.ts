import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { BithumbRestClient } from '../bithumb/bithumb-rest.client';
import { StateCache } from '../state/state-cache.service';
import { alertInput, dbError, id } from '../common/input';

@Injectable()
export class AlertService {
  private readonly logger = new Logger(AlertService.name);
  constructor(private readonly db: DatabaseService, private readonly bithumb: BithumbRestClient, private readonly cache: StateCache) {}
  async list() { try { return await this.db.priceAlert.findMany({ orderBy: { createdAt: 'desc' } }); } catch (e) { return dbError(e); } }
  async logs() { try { return await this.db.priceAlertLog.findMany({ orderBy: { triggeredAt: 'desc' }, take: 100 }); } catch (e) { return dbError(e); } }
  private async validateMarket(market: string) {
    if (!(await this.bithumb.getMarkets()).some(row => row.market === market)) throw new BadRequestException('Market is not currently listed');
  }
  async create(value: unknown) {
    const input = alertInput(value);
    await this.validateMarket(input.market!);
    let row;
    try { row = await this.db.priceAlert.create({ data: { ...input, market: input.market!, condition: input.condition!, targetPrice: input.targetPrice! } }); } catch (e) { return dbError(e); }
    await this.cache.refresh().catch(() => undefined);
    this.logger.log('Alert created');
    return row;
  }
  async update(key: string, value: unknown) {
    const recordId = id(key);
    const input = alertInput(value, true);
    if (input.market) await this.validateMarket(input.market);
    let row;
    try { row = await this.db.priceAlert.update({ where: { id: recordId }, data: { ...input, ...(input.enabled === true ? { lastTriggeredAt: null } : {}) } }); } catch (e) { return dbError(e); }
    await this.cache.refresh().catch(() => undefined);
    return row;
  }
  async delete(key: string) {
    const recordId = id(key);
    try { await this.db.priceAlert.delete({ where: { id: recordId } }); } catch (e) { return dbError(e); }
    await this.cache.refresh().catch(() => undefined);
  }
}
