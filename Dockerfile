FROM node:22-alpine

WORKDIR /app

# Navegador do piloto TribemD, iniciado somente na área de desenvolvedor.
RUN apk add --no-cache chromium xvfb nss freetype harfbuzz ca-certificates ttf-freefont

# Copia manifestos de dependência
COPY package*.json ./

# Instala dependências de produção
RUN npm ci

# Copia código-fonte e configurações
COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
COPY docs/prompts ./docs/prompts

# Porta padrão da aplicação HTTP
EXPOSE 3000

ENV PORT=3000
ENV NODE_ENV=production

# Comando padrão (API Webhook + UI). Para o worker, use command: ["npm", "run", "worker"]
CMD ["npm", "start"]
