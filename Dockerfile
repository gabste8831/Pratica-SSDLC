# Imagem multi-stage — RS-013: a imagem final não contém ferramentas de build
# nem dependências de desenvolvimento, e executa sob usuário não-root.

# ---------- build ----------
FROM node:20-bookworm-slim AS build

WORKDIR /app

# better-sqlite3 é um módulo nativo: precisa de toolchain apenas nesta etapa.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Remove as dependências de desenvolvimento, mantendo os binários nativos já compilados.
RUN npm prune --omit=dev

# ---------- runtime ----------
FROM node:20-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app

# RS-013 — usuário sem privilégios (a imagem base já fornece o usuário `node`).
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./

# Diretório do banco, de posse do usuário da aplicação.
RUN mkdir -p /app/data && chown -R node:node /app/data

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "dist/server.js"]
