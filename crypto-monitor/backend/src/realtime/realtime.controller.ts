import { Controller, Get, Req, Sse, UseGuards } from '@nestjs/common';
import { interval, map, startWith, takeWhile } from 'rxjs';
import { PortfolioGuard } from '../portfolio/portfolio.guard';
import { BithumbWebSocketClient } from '../bithumb/bithumb-websocket.client';
import { SessionService } from '../access/session.service';
@Controller('realtime')
@UseGuards(PortfolioGuard)
export class RealtimeController {
  constructor(private readonly ws: BithumbWebSocketClient, private readonly sessions: SessionService) {}
  @Get() status() { return this.ws.snapshot(); }
  @Sse('stream') stream(@Req() req: {headers: Record<string, string | undefined>}) {
    // A bounded one-second snapshot per browser prevents a slow client accumulating every tick.
    return interval(1000).pipe(startWith(0),
      takeWhile(() => Boolean(req.headers['x-monitor-token']) || this.sessions.valid(req.headers.cookie)),
      map(() => ({ data: this.ws.snapshot() })));
  }
}
