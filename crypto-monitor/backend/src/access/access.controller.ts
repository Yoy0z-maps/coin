import { Controller, Delete, Get, Header, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { PortfolioGuard } from '../portfolio/portfolio.guard';
import { SessionService } from './session.service';

@Controller('session')
export class AccessController {
  constructor(private readonly sessions: SessionService) {}
  @Get()
  @Header('Cache-Control', 'no-store')
  status(@Req() req: { headers: { cookie?: string } }) { return { authenticated: this.sessions.valid(req.headers.cookie) }; }
  @Post()
  @HttpCode(200)
  @UseGuards(PortfolioGuard)
  login(@Req() req: { headers: { cookie?: string } }, @Res({ passthrough: true }) res: { setHeader: (name: string, value: string) => void }) {
    this.sessions.remove(req.headers.cookie);
    res.setHeader('Set-Cookie', `monitor_session=${this.sessions.create()}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`);
    return { authenticated: true };
  }
  @Delete()
  @UseGuards(PortfolioGuard)
  @HttpCode(204)
  logout(@Req() req: { headers: { cookie?: string } }, @Res({ passthrough: true }) res: { setHeader: (name: string, value: string) => void }) {
    this.sessions.remove(req.headers.cookie);
    res.setHeader('Set-Cookie', 'monitor_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
  }
}
