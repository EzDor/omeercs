export class AuthRequestDto {
  headers: {
    authorization?: string;
  };
  auth?: {
    userId: string;
    tenantId: string;
    sessionClaims: Record<string, unknown>;
  };
}
