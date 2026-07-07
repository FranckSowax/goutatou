FROM node:20-slim AS build
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile && pnpm --filter @goutatou/service-whatsapp... build

FROM node:20-slim
RUN corepack enable
WORKDIR /repo
COPY --from=build /repo .
ENV NODE_ENV=production
CMD ["node", "services/whatsapp/dist/index.js"]
