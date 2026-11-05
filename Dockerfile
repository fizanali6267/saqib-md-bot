FROM node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    NODE_ENV=production \
    TZ=Asia/Karachi

# System dependencies (ffmpeg/imagemagick/webp for media features, git for runtime helpers)
# yt-dlp + yt-dlp-ejs: YouTube now requires solving JS signature/n-challenges.
#   yt-dlp-ejs provides the solver, node (already in this image) is the runtime.
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        ffmpeg imagemagick webp git ca-certificates curl tzdata python3 python3-pip \
        tesseract-ocr tesseract-ocr-eng && \
    pip3 install --no-cache-dir --break-system-packages -U yt-dlp yt-dlp-ejs bgutil-ytdlp-pot-provider && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# yt-dlp is used by .song / .video / .yts (replaces the dead public APIs)

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY . .

EXPOSE 3000

CMD ["node", "index.js"]
