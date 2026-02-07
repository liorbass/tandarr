# Stage 1: Install dependencies and build
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.server.json vite.config.ts index.html ./
COPY src/ ./src/
COPY public/ ./public/
RUN npm run build

# Stage 2: Production runtime
FROM node:22-alpine
RUN apk add --no-cache dumb-init wget
ENV NODE_ENV=production
ENV CONFIG_DIR=/config
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder /app/dist ./dist
RUN mkdir -p /config && chown node:node /config
USER node
EXPOSE 3000
VOLUME ["/config"]
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=10s \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/server/index.js"]
