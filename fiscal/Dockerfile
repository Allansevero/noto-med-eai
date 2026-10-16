FROM node:22-alpine AS builder

WORKDIR /app

# Copia contratos compartilhados e arquivos do serviço fiscal
COPY contratos/ ./contratos/
COPY fiscal/package*.json ./fiscal/
COPY fiscal/tsconfig*.json ./fiscal/
COPY fiscal/src/ ./fiscal/src/

WORKDIR /app/fiscal
RUN npm install
RUN npx tsc --noEmit

FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001

COPY contratos/ ./contratos/
COPY fiscal/package*.json ./fiscal/
COPY fiscal/src/ ./fiscal/src/

WORKDIR /app/fiscal
RUN npm install --omit=dev

USER node

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3001/health || exit 1

CMD ["npx", "tsx", "src/server.ts"]
