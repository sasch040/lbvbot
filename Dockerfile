FROM node:20

WORKDIR /app

COPY package*.json ./
RUN echo "force-clean-build-v12" && npm install && npx playwright install --with-deps

COPY . .

CMD ["node", "bot.js"]
