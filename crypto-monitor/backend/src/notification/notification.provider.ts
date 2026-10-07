import { Inject, Injectable, Logger } from '@nestjs/common';
import { setTimeout as delay } from 'node:timers/promises';
import { ENVIRONMENT } from '../config/config.module';
import { Environment } from '../config/environment';
export interface NotificationMessage { content: string }
export interface NotificationProvider { send(message: NotificationMessage): Promise<void> }
export const NOTIFICATION_PROVIDER = Symbol('NOTIFICATION_PROVIDER');
@Injectable()
export class DiscordNotificationProvider implements NotificationProvider {
  private tail: Promise<void> = Promise.resolve();
  private queued = 0;
  private nextAt = 0;
  private readonly logger = new Logger(DiscordNotificationProvider.name);
  constructor(@Inject(ENVIRONMENT) private readonly env: Environment) {}
  get configured() { return Boolean(this.env.discordWebhookUrl); }
  send(message: NotificationMessage): Promise<void> {
    if (!this.configured || this.queued >= 100 || !message.content || message.content.length > 2000) return Promise.reject(new Error('Discord unavailable or queue full'));
    this.queued++;
    const task = this.tail.catch(() => undefined).then(() => this.deliver(message));
    this.tail = task;
    return task.finally(() => { this.queued--; });
  }
  private async deliver(message: NotificationMessage) {
    try {
      const url = new URL(this.env.discordWebhookUrl); url.searchParams.set('wait', 'true');
      for (let attempt = 0; attempt < 3; attempt++) {
        await delay(Math.max(0, this.nextAt - Date.now()));
        const response = await fetch(url, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000), headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: message.content, allowed_mentions: { parse: [] } }) });
        this.nextAt = Date.now() + 500;
        if (response.status === 429) {
          const body = await response.json() as { retry_after?: number };
          const seconds = Number(body.retry_after);
          if (!Number.isFinite(seconds) || seconds < 0) throw new Error();
          this.nextAt = Date.now() + Math.ceil(seconds * 1000) + 100;
          if (seconds > 30) throw new Error();
          continue;
        }
        if (!response.ok) throw new Error();
        const result = await response.json() as { id?: string };
        if (!result.id) throw new Error();
        this.logger.log('Discord notification sent'); return;
      }
      throw new Error();
    } catch { this.logger.warn('Discord notification failed'); throw new Error('Discord delivery failed or unconfirmed'); }
  }
}
