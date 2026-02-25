# CLAUDE.md

## Development

- Always run infrastructure via Docker: `docker compose up -d` (uses `.env`, not `.env.local`)
- **Migrations require inline env vars**: TypeORM CLI does not load dotenv. Run with: `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/agentic_template pnpm migration:run` (substitute `run` for `generate`, `show`, `revert`).

## Key Patterns

- **Multi-tenancy**: tenantId on every entity, extracted from Clerk org, propagated via CLS
- **Queue Architecture**: API Center → BullMQ → Agent Platform (LangGraph workflows)
- **LLM Integration**: LiteLLM proxy abstracts providers (`/litellm/litellm_config.yaml`)
- **Auth Flow**: Clerk JWT → AuthGuard → TenantContextInterceptor → CLS

## Coding Rules

- **No code comments**: NEVER write code comments unless explicitly requested. Extract the intended comment into a small, well-named function instead.
- **No README files**: NEVER create README files unless explicitly requested.
- **No barrel files (index.ts)**: NEVER create index.ts re-export files. Always import directly from the source file. Exception: index.ts files with actual implementation logic.
- **Env file sync**: Every change to `.env.local` must also be applied to `.env`.
- **Check docs with Context7**: When working with 3rd party libraries or APIs, use the Context7 MCP tool (`mcp__context7__resolve-library-id` and `mcp__context7__query-docs`) to fetch up-to-date documentation before implementing.
