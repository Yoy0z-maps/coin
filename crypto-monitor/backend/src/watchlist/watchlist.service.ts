import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { BithumbRestClient } from '../bithumb/bithumb-rest.client';
import { StateCache } from '../state/state-cache.service';
import { normalizeMarket } from '../common/market';
import { bodyObject, boolean, dbError, id } from '../common/input';

@Injectable()
export class WatchlistService {
  private readonly logger = new Logger(WatchlistService.name);
  constructor(private readonly db: DatabaseService, private readonly bithumb: BithumbRestClient, private readonly cache: StateCache) {}
  async list() { try { return await this.db.watchlist.findMany({ orderBy: { createdAt: 'asc' } }); } catch (e) { return dbError(e); } }
  async create(value: unknown) {
    const body = bodyObject(value, ['market', 'enabled']);
    const market = normalizeMarket(body.market);
    const enabled = 'enabled' in body ? boolean(body.enabled) : true;
    if (!(await this.bithumb.getMarkets()).some(row => row.market === market)) throw new BadRequestException('Market is not currently listed');
    let row;
    try { row = await this.db.watchlist.create({ data: { market, enabled } }); } catch (e) { return dbError(e); }
    await this.cache.refresh().catch(() => undefined);
    this.logger.log('Watchlist created');
    return row;
  }
  async update(key: string, value: unknown) {
    const body = bodyObject(value, ['enabled']);
    const enabled = boolean(body.enabled);
    let row;
    try { row = await this.db.watchlist.update({ where: { id: id(key) }, data: { enabled } }); } catch (e) { if (e instanceof BadRequestException) throw e; return dbError(e); }
    await this.cache.refresh().catch(() => undefined);
    return row;
  }
  async delete(key: string) {
    const recordId = id(key);
    try { await this.db.watchlist.delete({ where: { id: recordId } }); } catch (e) { return dbError(e); }
    await this.cache.refresh().catch(() => undefined);
  }
}
