# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

ARG NEXT_PUBLIC_SYSTEM_TIMEZONE=Africa/Addis_Ababa
ENV NEXT_PUBLIC_SYSTEM_TIMEZONE=$NEXT_PUBLIC_SYSTEM_TIMEZONE
# Where the frontend forwards /api and /uploads when it is opened directly on its own port
# (fixed at build time; the backend container inside Docker)
ARG BACKEND_INTERNAL_URL=http://backend:4001
ENV BACKEND_INTERNAL_URL=$BACKEND_INTERNAL_URL
ENV NEXT_PUBLIC_BASE_URL=$BACKEND_INTERNAL_URL/api

COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY . .

RUN npm run build

# Stage 2: Runner
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

ENV PORT=3001
ENV HOSTNAME=0.0.0.0
EXPOSE 3001

CMD ["node", "server.js"]
