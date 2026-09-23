import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { StateCache } from './state-cache.service';
@Module({ imports: [DatabaseModule], providers: [StateCache], exports: [StateCache] })
export class StateModule {}
