# Asset Storage (S3/CDN)

## Purpose
Provide cloud-based storage for all generated campaign assets (images, videos, audio, bundles) with CDN delivery for fast global access. Replace the current local filesystem storage (`/tmp/skills/`) with production-ready S3 integration.

## User Stories

### P1 (Critical)
- US1: As a skill handler, I want to upload generated assets to S3 so that they persist beyond container restarts and are accessible globally
- US2: As the campaign player, I want to load assets from a CDN so that end users get fast load times regardless of location
- US3: As a developer, I want presigned URLs for secure asset access so that assets are protected from unauthorized access

### P2 (Important)
- US4: As the system, I want content-hash based deduplication so that identical assets are not stored multiple times
- US5: As an operator, I want asset lifecycle management so that old/unused assets are automatically cleaned up
- US6: As the run engine, I want to track asset upload status so that workflow steps can wait for upload completion

### P3 (Nice to Have)
- US7: As a developer, I want multi-region replication so that assets are available even during regional outages
- US8: As an operator, I want storage usage metrics per tenant so that I can monitor and bill appropriately

## Requirements

### Functional
- REQ1: Support uploading files up to 500MB (video assets)
- REQ2: Generate presigned URLs with configurable expiration (default 1 hour)
- REQ3: Support multiple asset types: image (png, jpg, webp), video (mp4, webm), audio (mp3, wav, ogg), bundle (zip, html)
- REQ4: Organize assets by tenant and run: `s3://bucket/{tenantId}/{runId}/{artifactType}/{filename}`
- REQ5: Return CDN URLs for public assets, presigned S3 URLs for private assets
- REQ6: Calculate and store SHA256 content hash for each uploaded asset

### Technical
- REQ7: Use AWS SDK v3 for S3 operations
- REQ8: Configure CloudFront distribution with S3 origin
- REQ9: Implement multipart upload for files > 5MB
- REQ10: Add retry logic with exponential backoff for upload failures
- REQ11: Integrate with existing Artifact entity - update `uri` field to store S3/CDN URL

### Security
- REQ12: Bucket policy: private by default, CDN access via OAC (Origin Access Control)
- REQ13: Presigned URLs must be tenant-scoped (cannot access other tenant's assets)
- REQ14: CORS configuration for browser-based uploads (if needed)

## Dependencies
- Depends on: Artifact entity (dao), ConfigService for AWS credentials
- Required by: All skill handlers that generate assets, Campaign Preview Player

## Integration Points
- `agent-platform/src/skills/handlers/*` - Update to use S3 upload instead of local filesystem
- `dao/src/entities/artifact.entity.ts` - Artifact.uri now stores S3/CDN URL
- `api-center/src/assets/` - May need updates for serving or redirecting to CDN

## Success Criteria
- [ ] Assets uploaded to S3 persist across container restarts
- [ ] CDN URLs load assets with < 100ms TTFB globally
- [ ] Presigned URLs expire correctly and deny access after expiration
- [ ] Duplicate assets (same content hash) are not re-uploaded
- [ ] Storage costs are trackable per tenant
- [ ] All existing skill handlers work with new storage backend
