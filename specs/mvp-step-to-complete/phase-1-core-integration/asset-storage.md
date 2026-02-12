# Asset Storage (S3/CDN)

## Purpose
Provide cloud-based storage for all generated campaign assets including 3D models (GLB/GLTF), textures, environment maps, images, videos, audio, and game bundles with CDN delivery for fast global access. Replace the current local filesystem storage (`/tmp/skills/`) with production-ready S3 integration. Since all game templates now use Three.js for 3D rendering, proper support for 3D asset formats and WebGL-compatible delivery is critical.

## User Stories

### P1 (Critical)
- US1: As a skill handler, I want to upload generated assets (3D models, textures, images, audio, video) to S3 so that they persist beyond container restarts and are accessible globally
- US2: As the campaign player, I want to load assets from a CDN so that end users get fast load times regardless of location
- US3: As a developer, I want presigned URLs for secure asset access so that assets are protected from unauthorized access
- US4: As a Three.js game template, I want to load 3D models and textures from CDN with proper CORS and Content-Type headers so that WebGL rendering works correctly

### P2 (Important)
- US5: As the system, I want content-hash based deduplication so that identical assets are not stored multiple times
- US6: As an operator, I want asset lifecycle management so that old/unused assets are automatically cleaned up
- US7: As the run engine, I want to track asset upload status so that workflow steps can wait for upload completion
- US8: As a game bundler, I want Draco-compressed GLB files and KTX2 textures so that 3D games load faster

### P3 (Nice to Have)
- US9: As a developer, I want multi-region replication so that assets are available even during regional outages
- US10: As an operator, I want storage usage metrics per tenant so that I can monitor and bill appropriately

## Requirements

### Functional
- REQ1: Support uploading files up to 500MB (video assets, large 3D models)
- REQ2: Generate presigned URLs with configurable expiration (default 1 hour)
- REQ3: Support all asset types with correct Content-Type headers:
  - Image: `image/png`, `image/jpeg`, `image/webp`
  - Video: `video/mp4`, `video/webm`
  - Audio: `audio/mpeg`, `audio/wav`, `audio/ogg`
  - Bundle: `application/zip`, `text/html`
  - 3D Model: `model/gltf-binary` (GLB), `model/gltf+json` (GLTF)
  - Texture: `image/png`, `image/jpeg`, `image/ktx2` (KTX2 compressed)
  - Environment Map: `image/vnd.radiance` (HDR), `image/x-exr` (EXR)
  - Shader: `text/plain` (GLSL)
- REQ4: Organize assets by tenant and run: `s3://bucket/{tenantId}/{runId}/{artifactType}/{filename}`
  - artifactType includes: `image`, `video`, `audio`, `bundle`, `model_3d`, `texture`, `environment_map`, `shader`
- REQ5: Return CDN URLs for public assets, presigned S3 URLs for private assets
- REQ6: Calculate and store SHA256 content hash for each uploaded asset

### 3D Asset Optimization
- REQ7: Support Draco compression for GLB files (reduces model size 70-90%) via Draco encoder
- REQ8: Support KTX2/Basis texture compression for GPU-compressed textures used by Three.js KTX2Loader
- REQ9: Support generating LOD (Level of Detail) variants of 3D models (high, medium, low) for mobile optimization
- REQ10: Typical file sizes:
  - 3D models (GLB): 100KB - 50MB (Draco compressed: 10KB - 5MB)
  - Textures: 50KB - 10MB (KTX2 compressed: 10-90% smaller)
  - HDRI environment maps: 5MB - 50MB
  - Compressed textures (KTX2): significantly smaller than PNG source

### Technical
- REQ11: Use AWS SDK v3 for S3 operations
- REQ12: Configure CloudFront distribution with S3 origin
- REQ13: Implement multipart upload for files > 5MB
- REQ14: Add retry logic with exponential backoff for upload failures
- REQ15: Integrate with existing Artifact entity - update `uri` field to store S3/CDN URL

### CDN Configuration for 3D Assets
- REQ16: Set `Cross-Origin-Resource-Policy: cross-origin` header for all assets (required for WebGL texture/model loading)
- REQ17: Configure CORS to allow loading 3D assets from CDN in WebGL context across origins
- REQ18: Enable range requests for large 3D model files (progressive loading)
- REQ19: Content-hash based naming for immutable 3D assets with long cache TTL (Cache-Control: max-age=31536000, immutable)
- REQ20: GZIP/Brotli compression for text-based formats (GLTF JSON, GLSL shaders)
- REQ21: Do NOT compress already-compressed formats (GLB, KTX2, MP4, MP3) at CDN level

### Security
- REQ22: Bucket policy: private by default, CDN access via OAC (Origin Access Control)
- REQ23: Presigned URLs must be tenant-scoped (cannot access other tenant's assets)
- REQ24: CORS configuration for browser-based uploads (if needed)

## Dependencies
- Depends on: Artifact entity (dao), ConfigService for AWS credentials
- Required by: All skill handlers that generate assets, Campaign Preview Player, Three.js game templates at runtime

## Integration Points
- `agent-platform/src/skills/handlers/*` - Update to use S3 upload instead of local filesystem
- `dao/src/entities/artifact.entity.ts` - Artifact.uri now stores S3/CDN URL
- `api-center/src/assets/` - May need updates for serving or redirecting to CDN

## Success Criteria
- [ ] Assets uploaded to S3 persist across container restarts
- [ ] CDN URLs load assets with < 100ms TTFB globally
- [ ] GLB files load correctly in Three.js via CDN URL using GLTFLoader
- [ ] KTX2 textures load correctly with Three.js KTX2Loader from CDN
- [ ] HDR environment maps load correctly with Three.js RGBELoader from CDN
- [ ] CORS headers allow WebGL texture and model loading cross-origin
- [ ] Draco-compressed GLB models decompress and render correctly in Three.js
- [ ] Content-Type headers are correct for all 3D asset formats
- [ ] Presigned URLs expire correctly and deny access after expiration
- [ ] Duplicate assets (same content hash) are not re-uploaded
- [ ] Storage costs are trackable per tenant
- [ ] All existing skill handlers work with new storage backend
