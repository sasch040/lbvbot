const { chromium } = require("playwright");

const PUSHOVER_USER = process.env.PUSHOVER_USER;
const PUSHOVER_TOKEN = process.env.PUSHOVER_TOKEN;

const TARGET_DATE = new Date("2026-05-15");
const DEBUG_DATE = new Date("2026-06-30");

async function sendPush(message) {
  try {
    await fetch("https://api.pushover.net/1/messages.json", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        token: PUSHOVER_TOKEN,
        user: PUSHOVER_USER,
        message
      })
    });
    console.log("Push gesendet:", message);
  } catch (e) {
    console.log("Push Fehler:", e.message);
  }
}

async function check() {
  console.log("Check startet:", new Date().toLocaleTimeString());

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox"]
  });

  const page = await browser.newPage();

  try {
    await page.goto("https://lbv-termine.de/frontend/index.php", {
      waitUntil: "domcontentloaded"
    });

    await page.locator('button:has-text("Verstanden")')
      .click({ timeout: 3000 })
      .catch(() => {});

    await page.click('text=Führerschein');
    await page.click('text=Neuerteilung nach Entzug');
    await page.click('text=weiter zur Terminvereinbarung');

    await page.check('input[type="checkbox"]');
    await page.click('text=weiter');

    await page.fill('input[name="vorname"]', "Max");
    await page.fill('input[name="nachname"]', "Mustermann");
    await page.fill('input[name="email"]', "test@test.de");

    await page.click('text=weiter zur Standortauswahl');

    await page.waitForSelector("text=Termine verfügbar ab", { timeout: 10000 });

    const text = await page.textContent("body");
    const match = text.match(/(\d{2}\.\d{2}\.\d{4})/);

    if (!match) {
      console.log("Kein Datum gefunden");
      return;
    }

    const [d, m, y] = match[1].split(".");
    const foundDate = new Date(`${y}-${m}-${d}`);

    console.log("Gefunden:", match[1]);

    if (foundDate <= DEBUG_DATE) {
      await sendPush(`🧪 DEBUG: ${match[1]}`);
    }

    if (foundDate < TARGET_DATE) {
      await sendPush(`🔥 TOP: ${match[1]}`);
    }

  } catch (err) {
    console.log("Fehler:", err.message);
  }

  await browser.close();
}

async function run() {
  while (true) {
    await check();
    await new Promise(r => setTimeout(r, 600000));
  }
}

run();
