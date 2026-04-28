const { chromium } = require("playwright");
const axios = require("axios");

const PUSHOVER_USER = process.env.PUSHOVER_USER;
const PUSHOVER_TOKEN = process.env.PUSHOVER_TOKEN;

const BEST_DATE = new Date("2026-04-30");
const OK_DATE = new Date("2026-05-15");

let lastNotified = null;

async function sendPush(title, message) {
  await axios.post("https://api.pushover.net/1/messages.json", {
    token: PUSHOVER_TOKEN,
    user: PUSHOVER_USER,
    title,
    message,
    priority: 1
  });
}

async function check() {
  const browser = await chromium.launch({
    headless: true
  });

  const page = await browser.newPage();

  try {
    await page.goto("https://lbv-termine.de/frontend/index.php", {
      waitUntil: "domcontentloaded"
    });

    // Popup schließen
    await page.locator('button:has-text("Verstanden")')
      .click({ timeout: 3000 })
      .catch(() => {});

    // Flow
    await page.click('text=Führerschein');
    await page.click('text=Neuerteilung nach Entzug');
    await page.click('text=weiter zur Terminvereinbarung');

    await page.check('input[type="checkbox"]');
    await page.click('text=weiter');

    await page.fill('input[name="vorname"]', "Max");
    await page.fill('input[name="nachname"]', "Mustermann");
    await page.fill('input[name="email"]', "test@test.de");

    await page.click('text=weiter zur Standortauswahl');

    await page.waitForSelector("text=Termine verfügbar ab");

    const text = await page.textContent("body");
    const match = text.match(/Termine verfügbar ab (\d{2}\.\d{2}\.\d{4})/);

    if (!match) return;

    const [d, m, y] = match[1].split(".");
    const foundDate = new Date(`${y}-${m}-${d}`);

    console.log("Gefunden:", match[1]);

    // kein Spam
    if (lastNotified && foundDate >= lastNotified) return;

    if (foundDate <= BEST_DATE) {
      await sendPush(
        "🔥 TOP TERMIN!",
        `📅 ${match[1]}\nJETZT BUCHEN!\nhttps://lbv-termine.de`
      );
      lastNotified = foundDate;
    } 
    else if (foundDate <= OK_DATE) {
      await sendPush(
        "⚡ Früher Termin",
        `📅 ${match[1]}\nhttps://lbv-termine.de`
      );
      lastNotified = foundDate;
    }

  } catch (err) {
    console.log("Fehler:", err.message);
  } finally {
    await browser.close();
  }
}

// alle 10 Minuten
setInterval(check, 10 * 60 * 1000);

// direkt starten
check();