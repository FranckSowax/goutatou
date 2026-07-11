FROM node:22-slim AS build
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile && pnpm --filter @goutatou/service-whatsapp... build

FROM node:22-slim
RUN corepack enable
# ffmpeg : requis par le worker d'extraction de frames LP (services/whatsapp/src/lpframes)
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /repo
COPY --from=build /repo .
ENV NODE_ENV=production
# Les paquets du monorepo (@goutatou/db, @goutatou/whapi) sont consommés en TS
# source (pas de dist buildé), et le service en dépend au runtime. On lance donc
# via tsx, qui transpile le TS à la volée et résout les specifiers .js -> .ts.
CMD ["pnpm", "--filter", "@goutatou/service-whatsapp", "exec", "tsx", "src/index.ts"]
