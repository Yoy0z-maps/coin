import { Module } from '@nestjs/common';
import { BithumbModule } from '../bithumb/bithumb.module';
import { PortfolioCalculator } from './portfolio.calculator';
import { PortfolioController } from './portfolio.controller';
import { PortfolioGuard } from './portfolio.guard';
import { PortfolioService } from './portfolio.service';

@Module({
  imports: [BithumbModule], controllers: [PortfolioController],
  providers: [PortfolioService, PortfolioCalculator, PortfolioGuard], exports: [PortfolioService],
})
export class PortfolioModule {}
