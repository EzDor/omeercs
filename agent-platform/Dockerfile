FROM node:20-slim

RUN if [ "$ENVIRONMENT" != "local-development" ] ; then apt update && apt install -y wget ; fi

# Install pnpm
RUN npm install -g pnpm@8.15.0

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

COPY agent-platform/ ./agent-platform/
COPY dao/ ./dao/
COPY dto/ ./dto/
COPY common/ ./common/

EXPOSE 3000
EXPOSE 9229

ARG ENVIRONMENT
RUN if [ "$ENVIRONMENT" = "local-development" ] ; then pnpm i --filter agent-platform... ; else pnpm i --frozen-lockfile --filter agent-platform... ; fi

RUN pnpm --filter agent-platform... run build

RUN chmod +x ./agent-platform/entrypoint.sh

ENTRYPOINT ["/app/agent-platform/entrypoint.sh"]
