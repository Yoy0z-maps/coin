import 'reflect-metadata';
import { ConsoleLogger, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { validateEnvironment } from './config/environment';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'node:path';

async function bootstrap(): Promise<void> {
  const env = validateEnvironment(process.env);
  // Suppress framework bootstrap exception dumps which may include connection details.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: false, abortOnError: false });
  app.use((_req: unknown, res: { setHeader: (name: string, value: string) => void }, next: () => void) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    next();
  });
  app.useStaticAssets(join(__dirname, '../public'), { index: false });
  app.useLogger(new ConsoleLogger({ logLevels: ['log', 'warn', 'error'] }));
  app.enableShutdownHooks();
  await app.listen(env.port, '0.0.0.0');
  new Logger('Bootstrap').log(`Application started on port ${env.port}`);
}

void bootstrap().catch(() => {
  console.error('Application startup failed; check environment and database availability');
  process.exitCode = 1;
});
