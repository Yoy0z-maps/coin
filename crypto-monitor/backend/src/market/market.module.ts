import { IndicatorModule } from '../indicator/indicator.module';
import { Module } from '@nestjs/common';
import { BithumbModule } from '../bithumb/bithumb.module';
import { MarketController } from './market.controller';
import { MarketService } from './market.service';

@Module({ imports: [BithumbModule, IndicatorModule], controllers: [MarketController], providers: [MarketService], exports: [MarketService] })
export class MarketModule {}
