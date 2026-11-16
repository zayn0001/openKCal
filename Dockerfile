# Build the frontend, then run the server with only its runtime dependencies
# (the Anthropic SDK and zod for AI, @simplewebauthn/server for passkeys, web-push for reminders).
FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production DATA_DIR=/data PORT=3000
COPY package*.json ./
RUN npm ci --omit=dev && mkdir /data && chown node:node /data
COPY server ./server
COPY src/lib ./src/lib
COPY --from=build /app/dist ./dist
USER node
VOLUME /data
EXPOSE 3000
HEALTHCHECK CMD wget -qO- http://localhost:$PORT/api/health || exit 1
# mirror.js runs the server, with DATA_DIR kept in an S3 bucket when MIRROR_ENDPOINT is set.
CMD ["node", "server/mirror.js"]
