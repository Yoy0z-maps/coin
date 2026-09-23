import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';

const TTL = 8 * 60 * 60 * 1000;
@Injectable()
export class SessionService {
  private readonly sessions = new Map<string, number>();
  private key(token: string) { return createHash('sha256').update(token).digest('hex'); }
  private prune() { for (const [key, expires] of this.sessions) if (expires <= Date.now()) this.sessions.delete(key); }
  create() {
    this.prune();
    if (this.sessions.size >= 50) this.sessions.delete(this.sessions.keys().next().value!);
    const token = randomBytes(32).toString('hex');
    this.sessions.set(this.key(token), Date.now() + TTL);
    return token;
  }
  token(cookie?: string): string {
    return cookie?.split(';').map(s => s.trim()).find(s => s.startsWith('monitor_session='))?.slice(16) ?? '';
  }
  valid(cookie?: string): boolean {
    this.prune();
    const token = this.token(cookie);
    return /^[a-f0-9]{64}$/.test(token) && (this.sessions.get(this.key(token)) ?? 0) > Date.now();
  }
  remove(cookie?: string) { this.sessions.delete(this.key(this.token(cookie))); }
}
