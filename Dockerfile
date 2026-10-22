FROM node:22.23.4-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source
COPY . .

# Build
RUN npm run build

# Production image
FROM node:22.23.4-alpine

WORKDIR /app

# Copy built files, migrations, OpenAPI spec, and production dependencies
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/openapi.json ./
COPY --from=builder /app/package*.json ./
RUN npm ci --omit=dev

# Expose port
EXPOSE 3000

# Start
CMD ["node", "dist/index.js"]
