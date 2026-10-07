import { Controller, Get, Post, Param, Body, UseGuards } from '@nestjs/common';
import { PortfolioGuard } from '../portfolio/portfolio.guard';
import { bodyObject } from '../common/input';
import { AgentService } from './agent.service';
@Controller('agent')
@UseGuards(PortfolioGuard)
export class AgentController {
 constructor(private readonly agent:AgentService){}
 @Get('status') status(){return this.agent.status();}
 @Post('market/:market') market(@Param('market') market:string,@Body() body:unknown){const b=bodyObject(body??{},['timeframe']);return this.agent.summarize('market',market,b.timeframe);}
 @Post('portfolio') portfolio(@Body() body:unknown){const b=bodyObject(body??{},['timeframe']);return this.agent.summarize('portfolio',undefined,b.timeframe);}
 @Post('briefing') briefing(@Body() body:unknown){const b=bodyObject(body??{},['timeframe']);return this.agent.summarize('briefing',undefined,b.timeframe);}
}
