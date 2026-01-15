---
name: init-local-dev-env
description: Initialize local development environment with Docker, dependencies, and database setup
---

## Initialize Local Development Environment

This command sets up the complete local development environment by checking prerequisites, configuring environment variables, installing dependencies, building packages, starting Docker services, and running database migrations.

### Actions:

1. **Check Docker Installation**: Verify Docker is installed by running `docker --version`.
   - If Docker is NOT installed, **STOP immediately** and display:
     ```
     ERROR: Docker is not installed.
     Please install Docker Desktop from: https://docs.docker.com/get-docker/
     After installation, restart this command.
     ```

2. **Check Docker Compose Installation**: Verify Docker Compose is installed by running `docker compose version`.
   - If Docker Compose is NOT installed, **STOP immediately** and display:
     ```
     ERROR: Docker Compose is not installed.
     Docker Compose is included with Docker Desktop. Please ensure Docker Desktop is properly installed.
     For standalone installation: https://docs.docker.com/compose/install/
     ```

3. **Check Docker Daemon Running**: Verify Docker daemon is running by executing `docker ps`.
   - If Docker is not running, **STOP immediately** and display:
     ```
     ERROR: Docker daemon is not running.
     Please start Docker Desktop and wait for it to be fully ready, then rerun this command.
     ```

4. **Check .env File Exists**: Check if `.env` file exists in the project root.
   - If `.env` does NOT exist:
     - Copy `.env.local` to `.env` using `cp .env.local .env`
     - Display the following message and **STOP**:
       ```
       SETUP REQUIRED: .env file has been created from .env.local template.

       You MUST update the following secrets in .env before continuing:

       REQUIRED:
       - CLERK_SECRET_KEY (line 39) - Get from Clerk Dashboard

       OPTIONAL (at least one LLM key recommended):
       - OPENAI_API_KEY (line 54)
       - ANTHROPIC_API_KEY (line 55)
       - GEMINI_API_KEY (line 56)

       OPTIONAL (for specific features):
       - FIRECRAWL_API_KEY (line 48) - For web scraping
       - GOOGLE_OAUTH_CLIENT_SECRET (line 65) - For Google Drive integration

       After updating the secrets, rerun this command: /init-local-dev-env
       ```

5. **Install Dependencies**: Run `pnpm install` from the project root to install all workspace dependencies.

6. **Build Shared Packages**: Run `pnpm -r build` to build all shared packages (dto, dao, common) in dependency order.

7. **Start Docker Services**: Run `docker compose up -d` to start all Docker services in detached mode.
   - This automatically loads the `.env` file from the project root.

8. **Wait for Database Health**: Wait for the center-db container to be healthy.
   - Run `docker compose ps` to check service status.
   - Wait up to 60 seconds for the database to be ready.
   - The initdb scripts in `dao/docker/initdb/` run automatically on first PostgreSQL startup:
     - `00-create-app-user.sh` - Creates app_user role
     - `01-create-app-schema.sh` - Creates app schema
     - `02-grant-permissions.sh` - Grants runtime permissions

9. **Run Database Migrations**: Execute `pnpm migration:run` to apply all pending database migrations.
   - This creates all necessary tables and schema objects.

10. **Verify Service Health**: Check container logs for errors:
    - Run `docker compose logs --tail=50 api-center` and check for errors
    - Run `docker compose logs --tail=50 agent-platform` and check for errors
    - Run `docker compose logs --tail=50 webapp` and check for errors
    - Report any errors found in the logs.

11. **Display Success Message**: If all steps complete successfully, display:
    ```
    SUCCESS: Local development environment is ready!

    Services running:
    - API Center: http://localhost:3001
    - Agent Platform API: http://localhost:3002
    - Web Application: http://localhost:5173
    - PostgreSQL Database: localhost:5432
    - Valkey (Redis): localhost:6379
    - LiteLLM Proxy: http://localhost:4000

    Next steps:
    - Access the webapp at http://localhost:5173
    - View logs: docker compose logs -f [service-name]
    - Stop services: docker compose down
    ```

### Error Handling:
- Docker not installed → **STOP** - Provide Docker Desktop installation link
- Docker Compose not installed → **STOP** - Provide Docker Compose installation instructions
- Docker not running → **STOP** - Instruct to start Docker Desktop
- Missing .env file → **STOP** - Create from template and list required secrets
- pnpm install fails → Report error details and suggest checking Node.js/pnpm versions
- Build failures → Report which package failed and show error output
- Docker compose fails → Show docker compose error output
- Database not healthy → Show database container logs
- Migration failures → Show migration error and suggest checking database connectivity
- Container errors → Show relevant log output and suggest fixes

**Note**: This command is idempotent and can be run multiple times safely. If the environment is already set up, it will verify everything is working correctly. The initdb scripts only run on first database initialization.
