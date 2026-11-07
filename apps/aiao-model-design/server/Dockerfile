FROM oven/bun:1.3.10 AS bun
FROM node:26.13.0-bookworm-slim
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
ENV NODE_ENV=production PORT=3200
COPY --chown=node:node server/ ./
USER node
EXPOSE 3200
CMD ["bun", "run", "index.js"]
