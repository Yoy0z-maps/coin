import { Global, Module } from '@nestjs/common';
import { PortfolioGuard } from '../portfolio/portfolio.guard';
import { SessionService } from './session.service';
import { AccessController } from './access.controller';

@Global()
@Module({ providers: [SessionService, PortfolioGuard], controllers: [AccessController], exports: [SessionService, PortfolioGuard] })
export class AccessModule {}
