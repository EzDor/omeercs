FROM node:20-slim

RUN if [ "$ENVIRONMENT" != "local-development" ] ; then apt update && apt install -y wget ; fi

# Install pnpm
RUN npm install -g pnpm@8.15.0

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

COPY api-center/ ./api-center/
COPY dao/ ./dao/
COPY dto/ ./dto/
COPY common/ ./common/

EXPOSE 3001
EXPOSE 9229

ARG ENVIRONMENT
RUN if [ "$ENVIRONMENT" = "local-development" ] ; then pnpm i --filter "@agentic-template/api-server..." ; else pnpm i --frozen-lockfile --filter "@agentic-template/api-server..." ; fi

RUN pnpm --filter "@agentic-template/api-server..." run build

RUN chmod +x ./api-center/entrypoint.sh

ENTRYPOINT ["/app/api-center/entrypoint.sh"]

