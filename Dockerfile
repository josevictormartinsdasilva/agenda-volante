# Estágio 1: gera o client do Prisma e compila o TypeScript
FROM node:22-alpine AS build
# O Prisma precisa do OpenSSL no Alpine
RUN apk add --no-cache openssl
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# Estágio 2: imagem final só com o necessário para rodar
FROM node:22-alpine
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
# `prisma` fica em dependencies para o container aplicar as migrations ao subir
RUN npm ci --omit=dev
COPY prisma ./prisma
RUN npx prisma generate
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3000
# Aplica as migrations pendentes e só então sobe a API
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node dist/server.js"]
