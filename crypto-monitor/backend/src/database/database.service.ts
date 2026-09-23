import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Inject } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ENVIRONMENT } from '../config/config.module';
import { Environment } from '../config/environment';

@Injectable()
export class DatabaseService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);

  constructor(@Inject(ENVIRONMENT) env: Environment) {
    super({ datasources: { db: { url: env.databaseUrl } }, log: [] });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      this.logger.log('PostgreSQL connected');
    } catch {
      throw new Error('PostgreSQL connection failed; verify database availability and credentials');
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  async isReady(): Promise<boolean> {
    try {
      // Checks connectivity AND that the application migration has been applied.
      await this.$queryRaw`SELECT "key" FROM "application_settings" LIMIT 1`;
      return true;
    } catch { return false; }
  }
}

