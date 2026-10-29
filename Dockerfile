FROM node:20-bullseye-slim

RUN apt-get update && \
    apt-get install -y ffmpeg imagemagick webp git && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 3000

CMD ["node", "index.js"]
