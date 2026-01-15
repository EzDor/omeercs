# webapp/Dockerfile

FROM node:20-slim

# Install pnpm
RUN npm install -g pnpm

WORKDIR /app

COPY webapp/package.json ./webapp/package.json
COPY pnpm-workspace.yaml package.json ./
COPY webapp/ ./webapp/
COPY dto/ ./dto/
COPY common/ ./common/

RUN pnpm install

RUN pnpm --filter @agentic-template/dto build
RUN pnpm --filter @agentic-template/common build

EXPOSE 5173

CMD ["pnpm", "run", "--filter", "webapp", "dev"]
