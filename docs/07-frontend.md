# Frontend (Webapp)

## Overview

The frontend is a **Vue 3** single-page application built with **Vite**, using **PrimeVue** (Aura theme) for UI components and **Pinia** for state management. It communicates with the API Center via REST and SSE.

**Location**: `webapp/src/`
**Port**: 5173

## Tech Stack

| Technology | Purpose |
|-----------|---------|
| Vue 3 (Composition API) | Reactive UI framework |
| Vite | Build tool and dev server |
| TypeScript | Type safety |
| Pinia | State management (stores) |
| PrimeVue + Aura | UI component library and theme |
| Clerk Vue SDK | Authentication (sign-in, sign-up, session management) |
| Axios | HTTP client for API calls |
| Vue Router | Client-side routing |
| vue-i18n | Internationalization |

## Directory Structure

```
webapp/src/
├── main.ts                 # App entry point — registers plugins
├── App.vue                 # Root component
├── router/
│   ├── index.ts           # Route definitions
│   └── auth.guard.ts      # Navigation guard for authentication
├── stores/
│   ├── chat.store.ts      # Chat session and message state
│   └── campaign.store.ts  # Campaign CRUD state
├── services/
│   ├── api/
│   │   ├── api-client.service.ts   # Axios instance with auth interceptor
│   │   └── auth.service.ts         # Auth token utilities
│   ├── chat.service.ts             # Chat API calls
│   ├── campaign.service.ts         # Campaign API calls
│   └── intelligence.service.ts     # Intelligence API calls
├── composables/
│   └── useStreamingChat.ts         # SSE streaming composable
├── pages/                  # Page-level components
├── components/             # Reusable UI components
├── layout/                 # App layout (sidebar, header, etc.)
├── locales/                # i18n translation files
├── assets/                 # Static assets (images, CSS)
├── constants/              # App-wide constants
├── helpers/                # Utility functions
└── interfaces/             # TypeScript type definitions
```

## Routing

**File**: `webapp/src/router/index.ts`

| Path | Component | Auth | Description |
|------|-----------|------|-------------|
| `/sign-in` | Clerk sign-in | Public | Login page |
| `/sign-up` | Clerk sign-up | Public | Registration page |
| `/chat` | ChatPage | Protected | AI chat interface |
| `/game-creation` | GameCreationPage | Protected | Game creation tool |
| `/campaigns` | CampaignsPage | Protected | Campaign management dashboard |
| `/intelligence` | IntelligencePage | Protected | Intelligence testing interface |
| `*` | 404Page | Public | Not found fallback |

Protected routes are wrapped in `AppLayout` which provides the sidebar navigation and header. The auth guard redirects unauthenticated users to `/sign-in`.

## Authentication Flow

1. User visits the app → Clerk Vue SDK checks for an active session
2. No session → redirect to `/sign-in` (Clerk's hosted login UI)
3. User signs in → Clerk sets session cookies and returns a JWT
4. The API client interceptor reads the JWT from Clerk and adds it as a `Bearer` token to every API request
5. Users must belong to a Clerk **Organization** — the org ID becomes the `tenantId` for all data isolation

**File**: `webapp/src/services/api/api-client.service.ts`
```typescript
// Simplified — the interceptor adds the Bearer token to every request
axiosInstance.interceptors.request.use(async (config) => {
  const token = await getToken();
  config.headers.Authorization = `Bearer ${token}`;
  return config;
});
```

## State Management (Pinia Stores)

### Chat Store

**File**: `webapp/src/stores/chat.store.ts`

Manages chat sessions and messages. Provides:

- **State**: `sessions` (list), `currentSession` (selected), `messages` (for current session), `isLoading`
- **Actions**:
  - `fetchSessions()` — Load the user's chat sessions
  - `createSession()` — Create a new empty session
  - `selectSession(id)` — Select a session and load its messages
  - `sendMessage(content)` — Send a user message and trigger LLM response
  - `deleteSession(id)` — Delete a session and remove from local state
  - `streamMessage()` — Connect to SSE stream for real-time responses

### Campaign Store

**File**: `webapp/src/stores/campaign.store.ts`

Manages campaigns with full CRUD. Provides:

- **State**: `campaigns` (list), `currentCampaign`, `total` (count), `isLoading`
- **Actions**:
  - `fetchCampaigns(query)` — List campaigns with filters, sorting, pagination
  - `createCampaign(data)` — Create a new draft campaign
  - `updateCampaign(id, data)` — Update name or configuration
  - `deleteCampaign(id, expectedVersion)` — Soft-delete with version control
  - `duplicateCampaign(id, name)` — Clone a campaign
  - `generateCampaign(id)` — Trigger the build workflow
  - `archiveCampaign(id)` — Archive a live campaign
  - `restoreCampaign(id)` — Restore an archived campaign

## Services Layer

Services wrap API calls and handle request/response formatting. Each service corresponds to an API module.

### API Client

**File**: `webapp/src/services/api/api-client.service.ts`

A configured Axios instance that:
- Sets the base URL from `VITE_API_CENTER_BASE_URL`
- Intercepts requests to inject the Clerk JWT as a Bearer token
- Provides `get()`, `post()`, `patch()`, `delete()` methods

### Chat Service

**File**: `webapp/src/services/chat.service.ts`

Wraps all chat API calls:
- `createSession()` → `POST /chat/sessions`
- `listSessions(params)` → `GET /chat/sessions`
- `getSession(id)` → `GET /chat/sessions/:id`
- `deleteSession(id)` → `DELETE /chat/sessions/:id`
- `sendMessage(sessionId, content)` → `POST /chat/sessions/:id/messages`
- `getMessages(sessionId)` → `GET /chat/sessions/:id/messages`
- `connectStream(sessionId, token)` → SSE connection to `/chat/sessions/:id/stream`

### Campaign Service

**File**: `webapp/src/services/campaign.service.ts`

Wraps all campaign API calls including bulk operations, public campaign fetching, and run history retrieval.

### Intelligence Service

**File**: `webapp/src/services/intelligence.service.ts`

Wraps intelligence API calls:
- Plan generation and acceptance
- Copy generation with compliance checking
- Theme extraction from brief text and images
- Theme validation (WCAG contrast)
- Theme presets lookup
- Generation history

## Composables

### useStreamingChat

**File**: `webapp/src/composables/useStreamingChat.ts`

A Vue 3 composable that manages an `EventSource` connection for real-time chat streaming:

```typescript
const { message, isStreaming, connect, disconnect } = useStreamingChat();

// Connect to SSE stream
connect(sessionId, token);

// Reactive state
// message.value accumulates the streaming response
// isStreaming.value is true while the stream is active
```

Features:
- Automatically accumulates streaming message chunks
- Provides reactive `isStreaming` state for UI loading indicators
- Auto-cleanup on component unmount (no leaked connections)

## Environment Variables

Frontend environment variables use the `VITE_` prefix (Vite convention):

| Variable | Description |
|----------|-------------|
| `VITE_API_CENTER_BASE_URL` | API Center base URL (default: `http://localhost:3001/api`) |
| `VITE_CLERK_PUBLISHABLE_KEY` | Clerk publishable key for frontend auth |

## UI Component Library

The app uses **PrimeVue** with the **Aura** theme for consistent, professional UI components. PrimeVue provides buttons, tables, dialogs, forms, toasts, and other standard UI elements.

Configuration is in `webapp/src/main.ts`:
```typescript
app.use(PrimeVue, {
  theme: { preset: Aura }
});
```
