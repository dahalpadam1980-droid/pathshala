import 'dotenv/config';

function num(v: string | undefined, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  port: num(process.env.PORT, 4000),
  jwtSecret: process.env.JWT_SECRET ?? 'dev-only-secret-change-me',
  accessTokenTtl: num(process.env.ACCESS_TOKEN_TTL, 900),
  refreshTokenTtl: num(process.env.REFRESH_TOKEN_TTL, 60 * 60 * 24 * 30),
  dbDriver: process.env.DB_DRIVER ?? 'pglite',
  uploadDir: process.env.UPLOAD_DIR ?? './uploads',
  publicUrl: process.env.PUBLIC_URL ?? 'http://localhost:4000',
  isProd: process.env.NODE_ENV === 'production',
  sms: {
    url: process.env.SMS_API_URL ?? '',
    key: process.env.SMS_API_KEY ?? '',
  },
  ai: {
    key: process.env.AI_API_KEY ?? '',
    model: process.env.AI_API_MODEL ?? '',
  },
};

if (config.isProd && config.jwtSecret.includes('change-me')) {
  throw new Error('JWT_SECRET must be set to a strong random value in production');
}
