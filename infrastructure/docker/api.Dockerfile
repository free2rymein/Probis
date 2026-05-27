FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/database/package.json packages/database/package.json
RUN pnpm install --frozen-lockfile=false

FROM deps AS builder
ENV DOCKER_STANDALONE=true
COPY . .
RUN pnpm --filter @probis/api build

FROM base AS runner
ENV NODE_ENV=production
COPY --from=builder /app/apps/api/.next/standalone ./
COPY --from=builder /app/apps/api/.next/static apps/api/.next/static
EXPOSE 3001
CMD ["node", "apps/api/server.js"]
