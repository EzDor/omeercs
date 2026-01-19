# Provider Adapters Contracts

**Feature**: [spec.md](../spec.md) | **Plan**: [plan.md](../plan.md)

## Overview

Provider Adapters are TypeScript interfaces (not REST APIs). Contracts are defined as TypeScript interface files.

## Contract Files

| File | Description |
|------|-------------|
| [image-provider.contract.ts](./image-provider.contract.ts) | Image generation interface contract |
| [video-provider.contract.ts](./video-provider.contract.ts) | Video generation interface contract |
| [audio-provider.contract.ts](./audio-provider.contract.ts) | Audio generation interface contract |
| [asset3d-provider.contract.ts](./asset3d-provider.contract.ts) | 3D asset generation interface contract |
| [segmentation-provider.contract.ts](./segmentation-provider.contract.ts) | Image segmentation interface contract |
| [provider-registry.contract.ts](./provider-registry.contract.ts) | Registry lookup interface contract |

## Usage

These contracts define the public API surface for Provider Adapters. Implementations in `common/src/providers/` must conform to these interfaces.

## Location in Codebase

Interfaces will be placed in: `dto/src/providers/interfaces/`
