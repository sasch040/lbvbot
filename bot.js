const { chromium } = require("playwright");

(async () => {
  console.log("START");

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox"]
  });

  const page = await browser.newPage();

  await page.goto("https://example.com");

  console.log("Titel:", await page.title());

  await browser.close();
})();
