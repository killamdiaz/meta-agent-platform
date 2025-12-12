FROM node:20-alpine AS base
WORKDIR /app/atlas/engine/server

# Root configs for path resolution
COPY tsconfig.json /app/tsconfig.json

# Server package files
COPY atlas/engine/server/package*.json ./
COPY atlas/engine/server/package-lock.json ./
COPY atlas/engine/server/tsconfig.json ./

# Shared packages needed for prebuild
COPY atlas/packages /app/atlas/packages

# Server source and scripts
COPY atlas/engine/server/src ./src
COPY atlas/engine/server/scripts ./scripts

RUN npm install --production=false
RUN npm run prebuild && npm run build

FROM node:20-alpine
WORKDIR /app/atlas/engine/server
ENV NODE_ENV=production
COPY --from=base /app/atlas/engine/server/package.json ./
COPY --from=base /app/atlas/engine/server/package-lock.json ./
COPY --from=base /app/atlas/engine/server/node_modules ./node_modules
COPY --from=base /app/atlas/engine/server/dist ./dist
COPY --from=base /app/atlas/packages /app/atlas/packages
CMD ["node", "dist/index.js"]
