import { DataSource } from 'typeorm';
import { ChatSession } from './entities/chat-session.entity';
import { ChatMessage } from './entities/chat-message.entity';
import { Artifact } from './entities/artifact.entity';
import { Run } from './entities/run.entity';
import { RunStep } from './entities/run-step.entity';
import { StepCache } from './entities/step-cache.entity';

function buildDatabaseUrl(): string {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const host = process.env.DB_HOST;
  const port = process.env.DB_PORT;
  const database = process.env.DB_NAME;
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD;

  const missingVars: string[] = [];
  if (!host) missingVars.push('DB_HOST');
  if (!port) missingVars.push('DB_PORT');
  if (!database) missingVars.push('DB_NAME');
  if (!user) missingVars.push('DB_USER');
  if (!password) missingVars.push('DB_PASSWORD');

  if (missingVars.length > 0) {
    throw new Error(`Missing required database environment variables: ${missingVars.join(', ')}. Alternatively, set DATABASE_URL.`);
  }

  return `postgresql://${user}:${encodeURIComponent(password as string)}@${host}:${port}/${database}`;
}

function getDatabaseSslConfig(): { rejectUnauthorized: boolean } | undefined {
  const sslRejectUnauthorized = process.env.DB_SSL_REJECT_UNAUTHORIZED || 'true';
  return sslRejectUnauthorized === 'false' ? { rejectUnauthorized: false } : undefined;
}

const AppDataSource = new DataSource({
  type: 'postgres',
  url: buildDatabaseUrl(),
  schema: process.env.APP_SCHEMA || 'app',
  entities: [ChatSession, ChatMessage, Artifact, Run, RunStep, StepCache],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  migrationsTableName: 'migrations',
  synchronize: false,
  logging: ['error', 'warn', 'migration'],
  ssl: getDatabaseSslConfig(),
});

export default AppDataSource;
