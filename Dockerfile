# syntax=docker/dockerfile:1
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN DATABASE_URL="postgresql://postgres:postgres@localhost:5432/testsimplify" \
    NEXTAUTH_URL="http://localhost:3000" \
    NEXTAUTH_SECRET="build-time-placeholder" \
    npm run build
RUN PRISMA_VER=$(node -p "require('./node_modules/prisma/package.json').version") \
    && mkdir -p /prisma-cli \
    && npm install --prefix /prisma-cli --no-save --no-audit --no-fund "prisma@${PRISMA_VER}"

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Don't run as root
RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs \
    && mkdir -p /app/uploads \
    && chown -R nextjs:nodejs /app/uploads

# Copy Prisma CLI + transitive deps so `npx prisma migrate deploy` works in the final image
COPY --from=builder /prisma-cli/node_modules ./node_modules
# Copy standalone output (includes server.js and minimal node_modules)
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Copy Prisma schema and generated client for migrations
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Use the standalone server.js produced by Next.js
CMD ["node", "server.js"]
