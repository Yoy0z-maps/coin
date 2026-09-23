import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { PortfolioGuard } from '../portfolio/portfolio.guard';
import { AlertService } from './alert.service';
@Controller('alerts')
@UseGuards(PortfolioGuard)
export class AlertController {
  constructor(private readonly service: AlertService) {}
  @Get() list() { return this.service.list(); }
  @Get('logs') logs() { return this.service.logs(); }
  @Post() create(@Body() body: unknown) { return this.service.create(body); }
  @Patch(':id') update(@Param('id') id: string, @Body() body: unknown) { return this.service.update(id, body); }
  @Delete(':id') @HttpCode(204) delete(@Param('id') id: string) { return this.service.delete(id); }
}
