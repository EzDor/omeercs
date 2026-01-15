export interface AuthenticatedRequest {
  auth?: {
    userId: string;
    tenantId: string;
    sessionClaims?: Record<string, unknown>;
  };
}
