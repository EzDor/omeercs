import { ConfigService } from '@nestjs/config';

export interface DatabaseSslConfig {
  rejectUnauthorized: boolean;
}

export class ConfigUtil {
  static getDatabaseUrl(configService: ConfigService): string {
    const host = configService.get<string>('DB_HOST');
    const port = configService.get<string>('DB_PORT');
    const database = configService.get<string>('DB_NAME');
    const user = configService.get<string>('DB_USER');
    const password = configService.get<string>('DB_PASSWORD');

    const missingVars: string[] = [];
    if (!host) missingVars.push('DB_HOST');
    if (!port) missingVars.push('DB_PORT');
    if (!database) missingVars.push('DB_NAME');
    if (!user) missingVars.push('DB_USER');
    if (!password) missingVars.push('DB_PASSWORD');

    if (missingVars.length > 0) {
      throw new Error(`Missing required database environment variables: ${missingVars.join(', ')}`);
    }

    return `postgresql://${user}:${encodeURIComponent(password as string)}@${host}:${port}/${database}`;
  }

  static getDatabaseSslConfig(configService: ConfigService): DatabaseSslConfig | undefined {
    const sslRejectUnauthorized = configService.get<string>('DB_SSL_REJECT_UNAUTHORIZED', 'true');
    return sslRejectUnauthorized === 'false' ? { rejectUnauthorized: false } : undefined;
  }
}
