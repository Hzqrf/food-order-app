# Caddy with the built frontend inside: serves the app, proxies /api and /media to the API, and
# gets and renews the HTTPS certificate by itself. Build context is the repository root.
FROM node:22-alpine AS build
WORKDIR /src
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
# Type-checking needs the generated API types, which are committed; no backend needed here.
RUN npm run build

FROM caddy:2.8-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /src/dist /srv
