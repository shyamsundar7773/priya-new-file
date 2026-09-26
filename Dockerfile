FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --no-fund --no-audit

COPY . .

ENV NODE_ENV=production HOST=0.0.0.0

EXPOSE 10000

CMD ["node", "server/index.js"]
