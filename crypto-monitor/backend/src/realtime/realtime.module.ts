import { Module } from '@nestjs/common';
import { BithumbModule } from '../bithumb/bithumb.module';
import { BithumbWebSocketClient } from '../bithumb/bithumb-websocket.client';
import { RealtimeController } from './realtime.controller';
@Module({ imports: [BithumbModule], controllers: [RealtimeController] })
export class RealtimeModule {}
