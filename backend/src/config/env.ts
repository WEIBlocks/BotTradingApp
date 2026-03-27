import { z } from 'zod';
import 'dotenv/config';
import { resolve } from 'path';
import { config } from 'dotenv';

// Load environment-specific .env file
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development';
config({ path: resolve(process.cwd(), envFile), override: true });

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().default('redis://localhost:6379'),

  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  // Google Play IAP — service account key JSON for receipt verification (optional in dev)
  GOOGLE_PLAY_SERVICE_KEY: z.string().default(''),
  GOOGLE_PLAY_PACKAGE_NAME: z.string().default('com.botttradeapp'),

  BINANCE_API_KEY: z.string().default(''),
  BINANCE_API_SECRET: z.string().default(''),
  BINANCE_TESTNET: z.coerce.boolean().default(true),

  EXCHANGE_ENCRYPTION_KEY: z.string().min(32),

  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),

  APPLE_CLIENT_ID: z.string().default(''),
  APPLE_TEAM_ID: z.string().default(''),
  APPLE_KEY_ID: z.string().default(''),

  // Coinbase OAuth (for exchange connection)
  COINBASE_CLIENT_ID: z.string().default(''),
  COINBASE_CLIENT_SECRET: z.string().default(''),
  COINBASE_REDIRECT_URI: z.string().default('bottrade://exchange/callback'),

  S3_ENDPOINT: z.string().default('http://localhost:9000'),
  S3_ACCESS_KEY: z.string().default('minioadmin'),
  S3_SECRET_KEY: z.string().default('minioadmin'),
  S3_BUCKET: z.string().default('bottrade-uploads'),
  S3_REGION: z.string().default('us-east-1'),

  ANTHROPIC_API_KEY: z.string().default(''),
  GEMINI_API_KEY: z.string().default(''),
  OPENAI_API_KEY: z.string().default(''),

  // Which provider to use: 'anthropic' | 'gemini' | 'openai' | 'auto'
  // 'auto' picks the first provider with a configured API key
  AI_PROVIDER: z.enum(['anthropic', 'gemini', 'openai', 'auto']).default('auto'),
  // Model override per provider (leave empty to use defaults)
  AI_MODEL: z.string().default(''),

  YOUTUBE_API_KEY: z.string().optional().default(''),
  AI_MODE: z.enum(['development', 'production']).optional().default('development'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export type Env = z.infer<typeof envSchema>;
