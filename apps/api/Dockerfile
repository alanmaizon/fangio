FROM node:20-bookworm-slim AS build

ENV PNPM_HOME="/pnpm"
ENV PATH="${PNPM_HOME}:${PATH}"
WORKDIR /repo

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/tsconfig.json ./apps/api/
COPY packages/schema/package.json packages/schema/tsconfig.json ./packages/schema/
COPY packages/tools/package.json packages/tools/tsconfig.json ./packages/tools/
COPY packages/planner/package.json packages/planner/tsconfig.json ./packages/planner/

RUN pnpm install --frozen-lockfile

COPY apps/api/src ./apps/api/src
COPY packages/schema/src ./packages/schema/src
COPY packages/tools/src ./packages/tools/src
COPY packages/planner/src ./packages/planner/src

RUN pnpm --filter @fangio/api... build
RUN pnpm --filter @fangio/api --prod deploy /opt/api

FROM node:20-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
ENV FANGIO_DATA_DIR=/tmp/fangio

COPY --from=build /opt/api ./

EXPOSE 3001
CMD ["node", "dist/index.js"]
