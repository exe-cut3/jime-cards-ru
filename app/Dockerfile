# Stage 1: build the static site (needs app/public/img + app/public/data,
# produced locally by scripts/prepare_app.py — they are not in git).
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ARG BASE_PATH=/
ENV BASE_PATH=$BASE_PATH
RUN npm run build

# Stage 2: serve it with nginx.
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
