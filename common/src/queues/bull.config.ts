import { ConfigService } from '@nestjs/config';

export const createBullConfig = (configService: ConfigService) => {
  const tlsEnabled = configService.get<string>('REDIS_TLS_ENABLED') === 'true';

  return {
    connection: {
      host: configService.get<string>('REDIS_HOST'),
      port: configService.get<number>('REDIS_PORT'),
      password: configService.get<string>('REDIS_PASSWORD'),
      tls: tlsEnabled ? {} : undefined,
    },
  };
};
