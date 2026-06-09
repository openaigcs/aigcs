# Stage 1: Build
FROM node:24-alpine AS builder
RUN apk add --no-cache python3 make g++ && ln -sf python3 /usr/bin/python
RUN corepack enable

WORKDIR /app
    COPY package.json ./
RUN corepack prepare $(grep '"packageManager"' package.json | sed 's/.*"\(pnpm@[^"]*\)".*/\1/') --activate

COPY pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.json drizzle.config.ts ./
COPY packages/core/package.json packages/core/
COPY packages/server/package.json packages/server/
COPY packages/admin/package.json packages/admin/
COPY packages/widget/package.json packages/widget/
COPY packages/plugins/native/package.json packages/plugins/native/
COPY packages/plugins/mastodon/package.json packages/plugins/mastodon/

RUN pnpm install --frozen-lockfile

COPY packages/core packages/core
COPY packages/server packages/server
COPY packages/admin packages/admin
COPY packages/widget packages/widget
COPY packages/plugins packages/plugins

RUN pnpm --filter @aigcs/core exec tsc && \
    pnpm --filter @aigcs/server exec tsc && \
    cd packages/widget && pnpm exec vite build && cd /app && \
    cd packages/admin && pnpm exec tsc && pnpm exec vite build && cd /app

RUN npm install -g esbuild && esbuild packages/plugins/native/index.ts --platform=node --format=esm --outfile=packages/plugins/native/index.js && \
    pnpm exec esbuild packages/plugins/mastodon/index.ts --bundle --platform=node --format=esm \
      --outfile=packages/plugins/mastodon/index.js \
      --external:@aigcs/core --external:hono --external:drizzle-orm \
      --external:better-sqlite3 --external:nanoid --external:zod

# Prepare clean output: dist + package.json per package, plus plugins
RUN mkdir -p /out/packages && \
    cp package.json pnpm-lock.yaml pnpm-workspace.yaml /out/ && \
    for pkg in core server admin widget; do \
      mkdir -p /out/packages/$pkg/dist && \
      cp -r packages/$pkg/dist/* /out/packages/$pkg/dist/ && \
      cp packages/$pkg/package.json /out/packages/$pkg/; \
    done && \
    cp -r packages/plugins /out/packages/plugins

# Stage 2: Production
FROM node:24-alpine
RUN corepack enable

WORKDIR /app
COPY --from=builder /out/package.json ./package.json
RUN corepack prepare $(grep '"packageManager"' package.json | sed 's/.*"\(pnpm@[^"]*\)".*/\1/') --activate
ENV NODE_ENV=production
ENV PORT=41905

COPY --from=builder /out/pnpm-lock.yaml /out/pnpm-workspace.yaml ./
COPY --from=builder /out/packages ./packages

RUN pnpm install --frozen-lockfile --prod

VOLUME ["/app/data"]
EXPOSE 41905

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:41905/api/health || exit 1

CMD ["node", "packages/server/dist/index.js"]
