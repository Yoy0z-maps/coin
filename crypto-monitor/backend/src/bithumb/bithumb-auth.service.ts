import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createHmac, randomUUID } from 'node:crypto';
import { ENVIRONMENT } from '../config/config.module';
import { Environment } from '../config/environment';

@Injectable()
export class BithumbAuthService {
  readonly #accessKey: string;
  readonly #secretKey: string;

  constructor(@Inject(ENVIRONMENT) env: Environment) {
    this.#accessKey = env.bithumbAccessKey;
    this.#secretKey = env.bithumbSecretKey;
  }

  // Intentionally scoped to GET /v1/accounts, which has no query parameters.
  createAccountsAuthorization(): string {
    if (!this.#accessKey || !this.#secretKey) {
      throw new ServiceUnavailableException({ code: 'BITHUMB_KEYS_MISSING', message: 'Bithumb read-only credentials are not configured' });
    }
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ access_key: this.#accessKey, nonce: randomUUID(), timestamp: Date.now() })).toString('base64url');
    const unsigned = `${header}.${payload}`;
    const signature = createHmac('sha256', this.#secretKey).update(unsigned).digest('base64url');
    return `Bearer ${unsigned}.${signature}`;
  }
}
