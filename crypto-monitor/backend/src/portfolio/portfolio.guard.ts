import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable, Optional, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import { ENVIRONMENT } from '../config/config.module';
import { Environment } from '../config/environment';
import { SessionService } from '../access/session.service';

@Injectable()
export class PortfolioGuard implements CanActivate {
  readonly #digest: Buffer | null;
  constructor(@Inject(ENVIRONMENT) env: Environment, @Optional() private readonly sessions?: SessionService) {
    this.#digest = env.portfolioApiToken ? createHash('sha256').update(env.portfolioApiToken).digest() : null;
  }
  canActivate(context: ExecutionContext): boolean {
    const response = context.switchToHttp().getResponse();
    response.setHeader('Cache-Control', 'no-store');
    if (!this.#digest) throw new ServiceUnavailableException('Portfolio access token is not configured');
    const request = context.switchToHttp().getRequest<{ headers: Record<string, string | string[] | undefined> }>();
    const origin = request.headers.origin;
    if (origin && origin !== `http://${request.headers.host}`) throw new ForbiddenException('Cross-origin access is not allowed');
    const cookie = request.headers.cookie;
    if (typeof cookie === 'string' && this.sessions?.valid(cookie)) return true;
    const token = request.headers['x-monitor-token'];
    if (typeof token !== 'string' || token.length > 256 || !timingSafeEqual(this.#digest, createHash('sha256').update(token).digest())) {
      throw new UnauthorizedException('A valid X-Monitor-Token is required');
    }
    return true;
  }
}
