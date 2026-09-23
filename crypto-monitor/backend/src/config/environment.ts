export interface Environment {
  databaseUrl: string;
  port: number;
  nodeEnv: string;
  timezone: string;
  bithumbAccessKey: string;
  bithumbSecretKey: string;
  portfolioApiToken: string;
}

// Error messages contain names only, never environment values or URL parser errors.
export function validateEnvironment(env: NodeJS.ProcessEnv): Environment {
  const invalid = new Set<string>();
  const databaseUrl = env.DATABASE_URL ?? '';
  try {
    const url = new URL(databaseUrl);
    if (!['postgresql:', 'postgres:'].includes(url.protocol) ||
        !url.hostname || !url.username || !url.password || url.pathname.length < 2 ||
        /replace_with|\$\{/.test(databaseUrl)) invalid.add('DATABASE_URL');
  } catch { invalid.add('DATABASE_URL'); }

  const portText = env.PORT ?? '3000';
  const port = Number(portText);
  if (!/^\d+$/.test(portText) || !Number.isInteger(port) || port < 1 || port > 65535) invalid.add('PORT');
  const nodeEnv = env.NODE_ENV ?? 'production';
  if (!['development', 'test', 'production'].includes(nodeEnv)) invalid.add('NODE_ENV');
  const timezone = env.TZ ?? 'Asia/Seoul';
  try { new Intl.DateTimeFormat('en', { timeZone: timezone }); }
  catch { invalid.add('TZ'); }
  const accessKey = (env.BITHUMB_ACCESS_KEY || '').trim();
  const apiKey = (env.BITHUMB_API_KEY || '').trim();
  const bithumbAccessKey = accessKey || apiKey;
  const bithumbSecretKey = (env.BITHUMB_SECRET_KEY || '').trim();
  if (accessKey && apiKey && accessKey !== apiKey) {
    invalid.add('BITHUMB_ACCESS_KEY/BITHUMB_API_KEY');
  }
  if (Boolean(bithumbAccessKey) !== Boolean(bithumbSecretKey)) {
    invalid.add('BITHUMB_ACCESS_KEY/BITHUMB_SECRET_KEY');
  }
  const portfolioApiToken = (env.PORTFOLIO_API_TOKEN || '').trim();
  if (portfolioApiToken && !/^[A-Za-z0-9_-]{32,256}$/.test(portfolioApiToken)) invalid.add('PORTFOLIO_API_TOKEN');
  if (env.DISCORD_WEBHOOK_URL) {
    try {
      const url = new URL(env.DISCORD_WEBHOOK_URL);
      if (url.protocol !== 'https:' || url.hostname !== 'discord.com' ||
          !/^\/api\/webhooks\/\d+\/[^/]+$/.test(url.pathname)) invalid.add('DISCORD_WEBHOOK_URL');
    } catch { invalid.add('DISCORD_WEBHOOK_URL'); }
  }
  if (invalid.size) throw new Error(`Invalid environment variables: ${[...invalid].join(', ')}`);
  return { databaseUrl, port, nodeEnv, timezone, bithumbAccessKey, bithumbSecretKey, portfolioApiToken };
}
