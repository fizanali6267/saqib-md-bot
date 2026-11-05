FROM node:20-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    NODE_ENV=production \
    TZ=Asia/Karachi

# System dependencies (ffmpeg/imagemagick/webp for media features, git for runtime helpers)
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        ffmpeg imagemagick webp git ca-certificates curl tzdata && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY . .

EXPOSE 3000

CMD ["node", "index.js"]
