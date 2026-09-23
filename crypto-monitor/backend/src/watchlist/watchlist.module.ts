import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { BithumbModule } from '../bithumb/bithumb.module';
import { StateModule } from '../state/state.module';
import { WatchlistController } from './watchlist.controller';
import { WatchlistService } from './watchlist.service';
@Module({ imports: [DatabaseModule, BithumbModule, StateModule], providers: [WatchlistService], controllers: [WatchlistController] })
export class WatchlistModule {}
