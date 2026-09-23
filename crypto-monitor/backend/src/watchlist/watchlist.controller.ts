import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { PortfolioGuard } from '../portfolio/portfolio.guard';
import { WatchlistService } from './watchlist.service';
@Controller('watchlist')
@UseGuards(PortfolioGuard)
export class WatchlistController {
  constructor(private readonly service: WatchlistService) {}
  @Get() list() { return this.service.list(); }
  @Post() create(@Body() body: unknown) { return this.service.create(body); }
  @Patch(':id') update(@Param('id') id: string, @Body() body: unknown) { return this.service.update(id, body); }
  @Delete(':id') @HttpCode(204) delete(@Param('id') id: string) { return this.service.delete(id); }
}
