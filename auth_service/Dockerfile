FROM node:22.23.4-bookworm-slim

WORKDIR /auth_service

# Install npm packages first for better layer caching.
# --legacy-peer-deps is required because several pinned legacy infra clients
# (sequelize@3, swagger-express-mw@0.1.0, ldapjs@1) predate modern peer rules.
COPY package.json package-lock.json ./
# scripts/ is needed before install: the postinstall hook runs scripts/patch-bagpipes.js
COPY scripts ./scripts
RUN npm ci --omit=dev --legacy-peer-deps

COPY . /auth_service

CMD ["node", "app.js"]
