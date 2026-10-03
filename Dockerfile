FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN OPENAI_API_KEY=build-only npm run build

FROM python:3.11-slim-bookworm
COPY deploy/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir --only-binary=:all: -r /tmp/requirements.txt
COPY --from=build /usr/local/bin/node /usr/local/bin/node
COPY --from=build /usr/lib/x86_64-linux-gnu/libstdc++.so.6* /usr/lib/x86_64-linux-gnu/
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
RUN ln -s /app/node_modules/ffmpeg-static/ffmpeg /usr/local/bin/ffmpeg \
 && ln -s /app/node_modules/ffprobe-static/bin/linux/x64/ffprobe /usr/local/bin/ffprobe \
 && node --version && ffmpeg -version && ffprobe -version \
 && python3 -c 'import cv2, numpy, scipy' \
 && mkdir -p /data/generated /data/profiles /data/voice /data/cache \
 && ln -s /data/generated public/media/generated && ln -s /data/profiles public/media/profiles \
 && ln -s /data/voice public/media/voice && ln -s /data/cache cache \
 && chmod +x server/start.sh && chown -R 1000:1000 /app /data
USER 1000:1000
ENV NODE_ENV=production PORT=8080 HOME=/app
EXPOSE 8080
CMD ["/app/server/start.sh"]
