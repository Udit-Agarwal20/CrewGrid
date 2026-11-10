import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  APP_ORIGIN: z.string().default('http://localhost:5173'),
  MONGODB_URI: z
    .string()
    .default('mongodb://127.0.0.1:27017/crewgrid_dev?replicaSet=rs0&directConnection=true'),
  MONGODB_DB: z.string().default('crewgrid_dev'),
  SESSION_COOKIE_NAME: z.string().default('crewgrid_session'),
  SESSION_DAYS: z.coerce.number().int().positive().default(7),
  COOKIE_SECURE: z
    .preprocess((val) => (val === 'true' || val === true ? true : false), z.boolean())
    .default(false),
  TRUST_PROXY: z
    .preprocess((val) => (val === 'true' || val === true ? true : false), z.boolean())
    .default(false),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  SEED_ALLOWED: z
    .preprocess((val) => (val === 'true' || val === true ? true : false), z.boolean())
    .default(false),
  SSE_POLL_MS: z.coerce.number().int().positive().default(750)
});

export type Env = z.infer<typeof EnvSchema>;

export const env: Env = EnvSchema.parse(process.env);

