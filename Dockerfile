FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=optional
COPY . .
ENV DATA_DIR=/data
VOLUME ["/data"]
EXPOSE 8787
CMD ["npx", "tsx", "src/index.ts"]
