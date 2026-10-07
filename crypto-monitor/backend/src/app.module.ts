import { AgentModule } from './agent/agent.module';
import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health/health.controller';
import { MarketModule } from './market/market.module';
import { PortfolioModule } from './portfolio/portfolio.module';
import { AccessModule } from './access/access.module';
import { WatchlistModule } from './watchlist/watchlist.module';
import { AlertModule } from './alert/alert.module';
import { RealtimeModule } from './realtime/realtime.module';
import { DashboardController } from './dashboard.controller';

@Module({ imports: [AgentModule, ConfigModule, AccessModule, DatabaseModule, MarketModule, PortfolioModule, WatchlistModule, AlertModule, RealtimeModule], controllers: [HealthController, DashboardController] })
export class AppModule {}
