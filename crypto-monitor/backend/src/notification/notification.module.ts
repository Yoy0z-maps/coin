import { Module } from '@nestjs/common';
import { DiscordNotificationProvider, NOTIFICATION_PROVIDER } from './notification.provider';
@Module({ providers: [DiscordNotificationProvider, { provide: NOTIFICATION_PROVIDER, useExisting: DiscordNotificationProvider }], exports: [NOTIFICATION_PROVIDER, DiscordNotificationProvider] })
export class NotificationModule {}
