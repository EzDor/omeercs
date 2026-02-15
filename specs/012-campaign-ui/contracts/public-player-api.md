# API Contracts: Public Player

**Base path**: `/play`
**Auth**: All endpoints are @Public (no authentication required)
**Rate limit**: Stricter per-IP throttle (e.g., 30 req/min)

---

## GET /play/:campaignId

Get campaign data for the public player. Returns bundle URL and game config.

**Path Parameters**:
- `campaignId`: uuid

**Response** (200 OK):
```typescript
{
  campaignId: string;
  name: string;
  templateId: string;
  bundleUrl: string;
  config: {
    theme: ThemeConfig;
    game: Record<string, unknown>;
  };
}
```

**Errors**:
- 404: Campaign not found or not in 'live' status
- 429: Rate limited

**Notes**:
- Only returns campaigns with status = 'live'
- Does NOT return tenantId, userId, or internal metadata
- Response is cacheable (Cache-Control: public, max-age=300)

---

## GET /play/:campaignId/embed

Same as above but intended for iframe embedding. Identical response format.

**Additional headers**:
- `X-Frame-Options: ALLOWALL`
- `Content-Security-Policy: frame-ancestors *`

---

## Common Types

```typescript
interface ThemeConfig {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  fontFamily: string;
  background: {
    type: 'solid' | 'gradient' | 'image';
    value: string;
  };
  logoUrl?: string;
}
```
