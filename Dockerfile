# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────────────────────────────────────
# Stage 1: Base Node.js environment with Corepack and pnpm
# ─────────────────────────────────────────────────────────────────────────────
FROM node:24-alpine AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && corepack prepare pnpm@11.21.0 --activate
WORKDIR /app

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2: Workspace Dependencies and Application Build
# ─────────────────────────────────────────────────────────────────────────────
FROM base AS builder

# Copy package manifests and workspace definition
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .nvmrc ./

# Install all workspace dependencies
RUN pnpm install --frozen-lockfile

# Copy application source tree and configuration files
COPY nx.json tsconfig.base.json ./
COPY apps/ ./apps/
COPY libs/ ./libs/

# Build both api and console applications
RUN pnpm nx run-many -t build -p api console

# ─────────────────────────────────────────────────────────────────────────────
# Stage 3: Production API Service (NestJS)
# ─────────────────────────────────────────────────────────────────────────────
FROM node:24-alpine AS api
ENV NODE_ENV=production
ENV API_PORT=3000

# Install curl for container health checks
RUN apk add --no-cache curl

# Enable Corepack and pnpm for isolated production dependency installation
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && corepack prepare pnpm@11.21.0 --activate

WORKDIR /app

# Copy workspace build policy
COPY pnpm-workspace.yaml ./

# Copy pruned backend build artifacts
COPY --from=builder /app/dist/apps/api/package.json ./package.json
COPY --from=builder /app/dist/apps/api/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=builder /app/dist/apps/api/main.js ./main.js
COPY --from=builder /app/dist/apps/api/main.js.map ./main.js.map

# Install production runtime dependencies
RUN pnpm install --prod --frozen-lockfile && pnpm store prune

# Run container as unprivileged node user
USER node

EXPOSE 3000

HEALTHCHECK --interval=5s --timeout=5s --start-period=10s --retries=5 \
  CMD curl -f http://127.0.0.1:${API_PORT:-3000}/api/fleet/summary || exit 1

CMD ["node", "main.js"]

# ─────────────────────────────────────────────────────────────────────────────
# Stage 4: Production Console Service (Angular SPA + Nginx Reverse Proxy)
# ─────────────────────────────────────────────────────────────────────────────
FROM nginx:alpine AS console
ENV API_URL=http://api:3000/api/

# Copy main nginx.conf configured with stdout/stderr logging and /tmp pid
COPY deploy/nginx/nginx.conf /etc/nginx/nginx.conf

# Copy custom Nginx configuration template (supports dynamic API_URL via envsubst)
COPY deploy/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY deploy/nginx/default.conf /etc/nginx/conf.d/default.conf

# Copy built Angular static bundle
COPY --from=builder /app/dist/apps/console/browser /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=5s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
