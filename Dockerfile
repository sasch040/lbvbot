FROM node:20

WORKDIR /app

COPY package*.json ./
RUN npm install && npx playwright install --with-deps

COPY . .

CMD ["node", "bot.js"]
