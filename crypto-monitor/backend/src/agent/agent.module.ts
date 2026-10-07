import { Module } from '@nestjs/common';
import { MarketModule } from '../market/market.module';
import { PortfolioModule } from '../portfolio/portfolio.module';
import { DatabaseModule } from '../database/database.module';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';
import { LLM_PROVIDER, GeminiProvider } from './llm.provider';
@Module({imports:[MarketModule,PortfolioModule,DatabaseModule],providers:[AgentService,{provide:LLM_PROVIDER,useClass:GeminiProvider}],controllers:[AgentController]})
export class AgentModule {}
