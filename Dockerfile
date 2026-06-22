FROM node:22-alpine

WORKDIR /app
COPY gateway.js /app/gateway.js

ENV NODE_ENV=production
CMD ["node", "/app/gateway.js"]

