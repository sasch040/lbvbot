FROM mcr.microsoft.com/playwright:v1.59.1-jammy

WORKDIR /app

COPY package*.json ./
RUN echo "force rebuild v4" && npm install

COPY . .

CMD ["node", "bot.js"]
