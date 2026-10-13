FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.js ./
COPY public ./public
COPY src ./src
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY src ./src
COPY public/hamsters/rects.json ./public/hamsters/rects.json
COPY --from=build /app/dist ./dist
USER node
EXPOSE 8080
CMD ["node", "server/index.mjs"]
