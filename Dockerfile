FROM node:22-bookworm-slim AS frontend-build
WORKDIR /app
COPY frontend/package.json ./frontend/
RUN cd frontend && npm install
COPY frontend/ ./frontend/
RUN cd frontend && npm run build

FROM node:22-bookworm-slim AS server-build
WORKDIR /app
COPY server/package.json ./server/
RUN cd server && npm install
COPY server/ ./server/
RUN cd server && npm run build

FROM node:22-bookworm-slim
WORKDIR /app
COPY server/package.json ./server/
RUN cd server && npm install --omit=dev
COPY --from=server-build /app/server/dist ./server/dist
COPY --from=server-build /app/server/schema.sql ./server/schema.sql
COPY --from=frontend-build /app/frontend/dist ./public
ENV NODE_ENV=production
ENV PORT=8080
ENV DATABASE_PATH=/data/game.db
ENV SCHEMA_PATH=/app/server/schema.sql
ENV PUBLIC_DIR=/app/public
WORKDIR /app/server
EXPOSE 8080
CMD ["node", "dist/index.js"]
