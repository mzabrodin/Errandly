FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci -w backend --ignore-scripts
COPY backend backend
RUN npm run build -w backend

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci -w backend --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/backend/dist backend/dist
USER node
EXPOSE 3000
CMD ["node", "backend/dist/main.js"]
