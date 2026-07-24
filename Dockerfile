FROM node:24-slim

RUN apt-get update && apt-get install -y python3 ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY . .

ENV PORT=8080
ENV NODE_OPTIONS=--max-old-space-size=128

RUN npm install

EXPOSE 8080

CMD ["node", "index.js"]
