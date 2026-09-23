import { Module } from '@nestjs/common';
import { BITHUMB_FETCH, BITHUMB_HTTP_OPTIONS, BithumbRestClient } from './bithumb-rest.client';
import { BithumbAuthService } from './bithumb-auth.service';
import { StateModule } from '../state/state.module';
import { BithumbWebSocketClient } from './bithumb-websocket.client';

@Module({
  imports: [StateModule],
  providers: [
    { provide: BITHUMB_FETCH, useValue: globalThis.fetch.bind(globalThis) },
    { provide: BITHUMB_HTTP_OPTIONS, useValue: { timeoutMs: 5000, intervalMs: 250, maxQueueMs: 5000 } },
    BithumbRestClient,
    BithumbAuthService,
    BithumbWebSocketClient,
  ],
  exports: [BithumbRestClient, BithumbWebSocketClient],
})
export class BithumbModule {}
