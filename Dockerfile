FROM mcr.microsoft.com/playwright:v1.59.1-jammy

WORKDIR /app

COPY package*.json ./
RUN echo "force rebuild v2" && npm install && npx playwright install

COPY . .

CMD ["node", "bot.js"]
