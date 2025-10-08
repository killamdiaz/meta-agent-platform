import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT || 4000),
  databaseUrl: process.env.DATABASE_URL || 'postgres://postgres:postgres@db:5432/postgres',
  openAiApiKey: process.env.OPENAI_API_KEY || '',
  coordinatorIntervalMs: Number(process.env.COORDINATOR_INTERVAL_MS || 15000)
};
