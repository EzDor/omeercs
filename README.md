# Agentic System Template

A production-ready template for building AI-powered applications with microservices architecture.

## Features

- **Microservices Architecture**: NestJS-based backend services with clear separation of concerns
- **Authentication**: Clerk integration for secure user authentication
- **Multi-tenant Support**: Row-Level Security (RLS) with PostgreSQL for data isolation
- **LLM Integration**: LiteLLM proxy for unified access to OpenAI, Anthropic, and other providers
- **Workflow Orchestration**: LangGraph-based workflow engine with LangSmith tracing
- **Queue System**: BullMQ with Valkey (Redis-compatible) for background processing
- **Modern Frontend**: Vue 3 with PrimeVue UI components and TailwindCSS
- **Docker Compose**: Complete local development environment

## Architecture

```
agentic-system-template/
├── agent-platform/     # Queue worker service (BullMQ processors)
├── api-center/         # API server (NestJS HTTP endpoints)
├── webapp/             # Frontend (Vue 3 + PrimeVue)
├── common/             # Shared utilities (auth, tenant, LLM client)
├── dao/                # Data Access Objects (TypeORM entities)
├── dto/                # Data Transfer Objects (validation)
└── litellm/            # LiteLLM proxy configuration
```

## Prerequisites

- Node.js 20.x or 22.x
- pnpm 8.x+
- Docker and Docker Compose
- A Clerk account (free tier available)
- At least one LLM API key (Gemini, OpenAI, or Anthropic)

## Quick Start

### Step 1: Clone and Install Dependencies

```bash
git clone <repository-url>
cd agentic-system-template
pnpm install
```

### Step 2: Create Environment File

```bash
cp .env.local .env
```

> **Note:** The webapp gets its environment variables from docker-compose, so you only need to configure the root `.env` file.

### Step 3: Set Up Clerk Authentication

1. Create a free account at [clerk.com](https://clerk.com)
2. Create a new application
3. **Enable Organizations** (required for multi-tenant support):
   - Go to **Configure** → **Organization settings**
   - Enable Organizations
4. Get your API keys from **Configure** → **API Keys**:
   - Copy the **Publishable key** (starts with `pk_test_` or `pk_live_`)
   - Copy the **Secret key** (starts with `sk_test_` or `sk_live_`)

5. Update `.env` with your keys:
   ```env
   CLERK_PUBLISHABLE_KEY=pk_test_YOUR_KEY_HERE
   CLERK_SECRET_KEY=sk_test_YOUR_KEY_HERE
   ```

### Step 4: Configure LLM API Keys

The template uses [LiteLLM](https://litellm.ai/) as a unified proxy to support multiple LLM providers. By default, it's configured to use **Google Gemini**.

**Option A: Use Gemini (Default - Recommended for Getting Started)**

1. Get a free API key from [Google AI Studio](https://aistudio.google.com/apikey)
2. Update `.env`:
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   ```

**Option B: Use OpenAI**

1. Get an API key from [OpenAI Platform](https://platform.openai.com/api-keys)
2. Update `.env`:
   ```env
   OPENAI_API_KEY=sk-your_openai_api_key_here
   CHAT_LLM_MODEL=gpt-4o-mini
   ```

**Option C: Use Anthropic (Claude)**

1. Get an API key from [Anthropic Console](https://console.anthropic.com/)
2. Update `.env`:
   ```env
   ANTHROPIC_API_KEY=sk-ant-your_anthropic_api_key_here
   CHAT_LLM_MODEL=claude-3.5-haiku
   ```

**Available Models** (configured in `litellm/litellm_config.yaml`):

| Provider | Model Names |
|----------|-------------|
| Gemini | `gemini-2.5-flash`, `gemini-2.5-flash-lite`, `gemini-2.0-flash`, `gemini-2.0-flash-lite` |
| OpenAI | `gpt-4.1`, `gpt-4.1-mini`, `gpt-4o`, `gpt-4o-mini`, `o3`, `o3-mini` |
| Anthropic | `claude-sonnet-4.5`, `claude-opus-4`, `claude-sonnet-4`, `claude-3.5-haiku` |

To add more providers or models, edit `litellm/litellm_config.yaml`.

### Step 5: Start Docker Services

```bash
docker compose up -d
```

Wait for all services to be healthy (this may take 1-2 minutes on first run):
```bash
docker compose ps
```

All services should show status as "running" or "healthy".

### Step 6: Run Database Migrations

Once the database is running, create the required tables:

```bash
# Generate migration (only needed if entities changed)
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/agentic_template pnpm migration:generate dao/src/migrations/InitialSchema

# Run migrations to create tables
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/agentic_template pnpm migration:run
```

### Step 7: Access the Application

| Service | URL | Description |
|---------|-----|-------------|
| **Webapp** | http://localhost:5173 | Main application UI |
| **API Center** | http://localhost:3001 | Backend API |
| **LiteLLM Proxy** | http://localhost:4000 | LLM gateway (docs at `/docs`) |
| **LiteLLM UI** | http://localhost:4000/ui | LLM admin panel (user: `admin`, pass: `sk-1234`) |

## Optional Configuration

### LangSmith Tracing (Recommended for Development)

Enable tracing to debug and monitor your LLM workflows:

1. Create an account at [smith.langchain.com](https://smith.langchain.com)
2. Get an API key from Settings
3. Update `.env`:
   ```env
   LANGCHAIN_TRACING_V2=true
   LANGCHAIN_API_KEY=ls__YOUR_API_KEY_HERE
   LANGCHAIN_PROJECT=agentic-template-dev
   ```

## Development

### Useful Commands

```bash
# View logs
docker compose logs -f api-center
docker compose logs -f agent-platform

# Rebuild after code changes
docker compose up -d --build

# Stop all services
docker compose down

# Stop and remove all data (fresh start)
docker compose down -v
```

### Database Migrations

```bash
# Show migration status
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/agentic_template pnpm migration:show

# Generate a new migration after entity changes
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/agentic_template pnpm migration:generate dao/src/migrations/MigrationName

# Run pending migrations
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/agentic_template pnpm migration:run

# Revert last migration
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/agentic_template pnpm migration:revert
```

### Build All Packages

```bash
pnpm -r build
```

### Run Tests

```bash
pnpm test
```

## Service Ports

| Service | Port | Description |
|---------|------|-------------|
| webapp | 5173 | Vue.js frontend |
| api-center | 3001 | API server |
| agent-platform | 3000 | Queue worker (internal) |
| center-db | 5432 | PostgreSQL |
| valkey | 6379 | Redis-compatible cache |
| litellm-proxy | 4000 | LLM gateway |

## Troubleshooting

### "relation does not exist" error
Run database migrations:
```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/agentic_template pnpm migration:run
```

### Clerk authentication not working
- Verify your Clerk keys are correct in `.env`
- Ensure Organizations are enabled in your Clerk dashboard
- Restart the webapp container after changing keys: `docker compose restart webapp`

### LLM calls failing
- Check that at least one LLM API key is set in `.env`
- Verify the `CHAT_LLM_MODEL` matches an available model in `litellm/litellm_config.yaml`
- Check LiteLLM logs: `docker compose logs litellm-proxy`

### Services not starting
```bash
# Check service status
docker compose ps

# View logs for specific service
docker compose logs <service-name>

# Restart all services
docker compose restart
```

## Included Example

The template includes a working **Chat** feature that demonstrates:
- SSE streaming responses from LLM
- Session management with multi-tenant isolation
- Vue 3 reactive UI with real-time updates
- BullMQ workflow integration

## Adding Your Business Logic

1. **Create entities** in `dao/src/entities/`
2. **Create DTOs** in `dto/src/`
3. **Add modules** to `api-center/` for API endpoints
4. **Add workflows** to `agent-platform/` for background processing
5. **Add pages** to `webapp/src/pages/`
6. **Generate and run migrations** for database changes

## License

MIT
