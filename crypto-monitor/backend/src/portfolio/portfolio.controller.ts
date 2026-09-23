import { Controller, Get, Header, UseGuards } from '@nestjs/common';
import { PortfolioGuard } from './portfolio.guard';
import { PortfolioService } from './portfolio.service';

@Controller('portfolio')
@UseGuards(PortfolioGuard)
export class PortfolioController {
  constructor(private readonly portfolio: PortfolioService) {}
  @Get()
  @Header('Cache-Control', 'no-store')
  getPortfolio() { return this.portfolio.getPortfolio(); }
}
