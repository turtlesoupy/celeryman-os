FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN OPENAI_API_KEY=build-only npm run build

FROM node:22-bookworm-slim
# Bootstrap HTTPS with Node's bundled trusted roots; the Debian package replaces
# this bundle below. Some Cloud Build egress paths stall on plain HTTP mirrors.
RUN node -e "const fs=require('fs');fs.mkdirSync('/etc/ssl/certs',{recursive:true});fs.writeFileSync('/etc/ssl/certs/ca-certificates.crt',require('tls').rootCertificates.join('\n'))" \
 && sed -i 's|http://deb.debian.org|https://deb.debian.org|g' /etc/apt/sources.list.d/debian.sources \
 && apt-get -o Acquire::https::Timeout=30 -o Acquire::Retries=2 update \
 && DEBIAN_FRONTEND=noninteractive apt-get -o Acquire::https::Timeout=30 -o Acquire::Retries=2 install -y --no-install-recommends ffmpeg python3-numpy python3-scipy python3-opencv ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package*.json ./
COPY server ./server
COPY src ./src
COPY scripts ./scripts
COPY public/media/original ./public/media/original
COPY public/media/motion ./public/media/motion
COPY reference/paul-rudd.png reference/thomas-dimson.jpg ./reference/
RUN mkdir -p /data/generated /data/profiles /data/voice /data/cache && ln -s /data/generated public/media/generated && ln -s /data/profiles public/media/profiles && ln -s /data/voice public/media/voice && ln -s /data/cache cache && chown -R node:node /app /data
USER node
ENV NODE_ENV=production PORT=8080
EXPOSE 8080
CMD ["node", "--import", "tsx", "server/production.ts"]
