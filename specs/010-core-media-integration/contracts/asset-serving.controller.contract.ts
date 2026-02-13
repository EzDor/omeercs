/**
 * Asset Serving Controller Contract (api-center)
 *
 * Extends existing AssetsController with tenant-scoped endpoints.
 * Existing public endpoint for game bundles remains unchanged.
 */

/**
 * GET /api/media/{tenantId}/{runId}/{artifactType}/{filename}
 *
 * Tenant-scoped asset serving. Requires authentication.
 * Validates that the requesting tenant matches {tenantId} in the path.
 *
 * Response: Streams the file with correct Content-Type and CORS headers.
 *
 * Headers:
 *   Content-Type: <mime-type based on extension>
 *   Access-Control-Allow-Origin: *
 *   Cross-Origin-Resource-Policy: cross-origin
 *   Cache-Control: public, max-age=31536000, immutable (for hash-named files)
 *
 * Errors:
 *   401 Unauthorized — no valid auth token
 *   403 Forbidden — tenant mismatch
 *   404 Not Found — file does not exist
 *   400 Bad Request — path traversal attempt
 */

/**
 * GET /api/assets/{runId}/* (existing — unchanged)
 *
 * Public game bundle serving. No authentication required.
 * Serves from {SKILLS_OUTPUT_DIR}/{runId}/bundle/{path}.
 */
