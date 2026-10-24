# Same app on Render, Koyeb, Railway, AWS (App Runner / ECS / Lightsail) or any VPS.
FROM node:22-alpine AS build
WORKDIR /app
RUN npm install -g pnpm@10
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build \
 && cp -r .next/static .next/standalone/.next/static \
 && cp -r public .next/standalone/public

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
RUN npm install -g pnpm@10
# Full dependency tree + sources are kept so database migrations can run when the container starts.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml /app/tsconfig.json ./
COPY --from=build /app/src ./src
COPY --from=build /app/.next/standalone ./standalone
EXPOSE 3000
# Env needed at runtime: DATABASE_URL, DB_SSL, AUTH_SECRET, CRON_SECRET (and AUTH_TRUST_HOST=true behind a proxy).
# Migrations are idempotent, so they run on every start before the server.
CMD ["sh", "-c", "pnpm migration:run && node standalone/server.js"]
