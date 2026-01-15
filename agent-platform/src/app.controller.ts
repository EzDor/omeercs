import { Controller, Get, Request } from '@nestjs/common';
import { AppService } from './app.service';
import { Public } from '@agentic-template/common/src/auth/public.decorator';

interface AuthRequest {
  auth: {
    userId: string;
    sessionClaims: Record<string, unknown>;
  };
}

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Public()
  @Get()
  getHello(): string {
    const result = this.appService.getHello();
    return result;
  }

  @Get('profile')
  getProfile(@Request() req: AuthRequest): { userId: string; sessionClaims: Record<string, unknown> } {
    return {
      userId: req.auth.userId,
      sessionClaims: req.auth.sessionClaims,
    };
  }
}
