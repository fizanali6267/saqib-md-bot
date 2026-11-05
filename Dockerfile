FROM node:20-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    NODE_ENV=production \
    TZ=Asia/Karachi

# System dependencies (ffmpeg/imagemagick/webp for media features, git for runtime helpers)
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        ffmpeg imagemagick webp git ca-certificates curl tzdata python3 python3-pip && \
    pip3 install --no-cache-dir --break-system-packages -U yt-dlp && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# yt-dlp is used by .song / .video / .yts (replaces the dead public APIs)

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY . .

EXPOSE 3000

CMD ["node", "index.js"]
