FROM node:22-alpine AS builder

WORKDIR /app

# Copia contratos compartilhados e arquivos do serviço de IA
COPY contratos/ ./contratos/
COPY ia/package*.json ./ia/
COPY ia/tsconfig*.json ./ia/
COPY ia/src/ ./ia/src/

WORKDIR /app/ia
RUN npm install
RUN npx tsc --noEmit

FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3002

COPY contratos/ ./contratos/
COPY ia/package*.json ./ia/
COPY ia/src/ ./ia/src/

WORKDIR /app/ia
RUN npm install --omit=dev

USER node

EXPOSE 3002

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3002/health || exit 1

CMD ["npx", "tsx", "src/server.ts"]
