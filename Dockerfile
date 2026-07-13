# ---- Build stage ----
FROM node:22-slim AS build

WORKDIR /app

# Install build tools
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Copy dependency files
COPY package.json package-lock.json ./
COPY packages/sdk/package.json packages/sdk/

# Install all deps
RUN npm ci

# Copy all source
COPY tsconfig.json tsup.config.ts ./
COPY src/ src/
COPY packages/ packages/
COPY bin/ bin/

# Build SDK + backend
RUN npm run build:sdk && npm run build:backend

# ---- Runtime stage ----
FROM node:22-slim

WORKDIR /app

# Copy package files and install production deps
COPY package.json package-lock.json ./
RUN apt-get update && apt-get install -y python3 make g++ \
    && npm pkg delete scripts.prepare \
    && npm ci --omit=dev \
    && npm cache clean --force \
    && apt-get purge -y python3 make g++ \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

# Copy pre-built native module
COPY --from=build /app/node_modules/better-sqlite3/build/Release/better_sqlite3.node /app/node_modules/better-sqlite3/build/Release/better_sqlite3.node

# Copy compiled code
COPY --from=build /app/dist/ dist/
COPY --from=build /app/bin/ bin/
COPY --from=build /app/package.json ./

# Create config directory and default config
RUN mkdir -p /data

ENV TELETON_HOME=/data
VOLUME /data

RUN chown -R node:node /app /data
USER node

EXPOSE 7777

# Use a startup script that checks for config
COPY docker-entrypoint.sh /app/
RUN chmod +x /app/docker-entrypoint.sh

ENTRYPOINT ["/app/docker-entrypoint.sh"]