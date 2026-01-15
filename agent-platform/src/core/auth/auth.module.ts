import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { AuthGuard } from '@agentic-template/common/src/auth/auth.guard';

@Module({
  providers: [
    {
      provide: APP_GUARD,
      useFactory: (configService: ConfigService, reflector: Reflector): AuthGuard => {
        const clerkSecretKey = configService.get<string>('CLERK_SECRET_KEY');
        const clerkPublishableKey = configService.get<string>('CLERK_PUBLISHABLE_KEY');

        if (!clerkSecretKey) {
          throw new Error('CLERK_SECRET_KEY is not configured');
        }

        return new AuthGuard(reflector, clerkSecretKey, clerkPublishableKey);
      },
      inject: [ConfigService, Reflector],
    },
  ],
})
export class AuthModule {}
