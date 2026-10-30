FROM node:22-alpine

WORKDIR /app
COPY --chown=node:node apps/web/server.js .
COPY --chown=node:node apps/web/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]
