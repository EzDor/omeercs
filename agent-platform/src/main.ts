import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  const corsDomain = configService.get<string>('CORS_DOMAIN', 'localhost');
  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (!origin) {
        callback(null, true);
        return;
      }
      const originUrl = new URL(origin);
      const isAllowed = originUrl.hostname === corsDomain || originUrl.hostname.endsWith(`.${corsDomain}`) || originUrl.hostname === 'localhost';
      callback(null, isAllowed);
    },
    credentials: true,
  });

  const port = configService.get<number>('PORT', 3000);
  await app.listen(port);
}
void bootstrap();
