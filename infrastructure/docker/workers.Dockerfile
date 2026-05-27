FROM node:22-alpine

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/workers/package.json apps/workers/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --filter @probis/workers... --frozen-lockfile

COPY apps/workers ./apps/workers
COPY packages/database ./packages/database
COPY packages/shared ./packages/shared
COPY tsconfig.base.json ./

WORKDIR /app/apps/workers

CMD ["pnpm", "start"]
