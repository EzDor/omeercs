# Spec 3 — Provider Adapters (Thin Wrappers)

## Goal
Create a minimal provider abstraction so Skills can call media generation APIs without coupling to any vendor.

## Design choice
Keep wrappers **thin**:
- normalize only what you must (uri + minimal metadata)
- do not build a complex capability framework yet

## Provider Interfaces
- `ImageProvider.generateImage(params) -> { uri, metadata }`
- `VideoProvider.generateVideo(params) -> { uri, metadata }`
- `AudioProvider.generateAudio(params) -> { uri, metadata }`
- `Asset3DProvider.generate3D(params) -> { uri, metadata }`
- `SegmentationProvider.segment(params) -> { uri/mask, bounds, metadata }`

## Provider Registry
- `ProviderRegistry.get(type, provider_id)` returns implementation

## Provider params (common fields)
- `prompt`
- `negative_prompt?`
- `duration_sec?`
- `resolution?`
- `format`
- `seed?` (optional, best effort)
- `input_uris?` (for image-to-video, etc.)
- `brand_assets?` (uris)

## Metadata (minimum stored)
- `provider_id`
- `model`
- `duration_sec?`
- `resolution?`
- `cost_usd?` (if available)
- `raw_response?` (optional, for debugging)

## Deliverables
- Provider interface definitions
- Registry + DI wiring in NestJS
- One concrete adapter implementation (your first provider)
- Sample skill that calls provider adapter and returns artifact uri
