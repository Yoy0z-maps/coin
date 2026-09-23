import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Controller('health')
export class HealthController {
  constructor(private readonly database: DatabaseService) {}

  @Get()
  async check() {
    const ready = await this.database.isReady();
    const response = {
      status: ready ? 'ok' : 'error',
      database: ready ? 'up' : 'down',
      timestamp: new Date().toISOString(),
    };
    if (!ready) throw new ServiceUnavailableException(response);
    return response;
  }
}

