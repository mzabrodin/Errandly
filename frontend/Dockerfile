FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci -w frontend --ignore-scripts
COPY tsconfig.base.json ./
COPY frontend frontend
RUN npm run build -w frontend

FROM nginxinc/nginx-unprivileged:1.30-alpine
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY frontend/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 8080
