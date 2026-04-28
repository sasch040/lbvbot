const { chromium } = require("playwright");
const axios = require("axios");

// 🔐 ENV Variablen aus Railway
const PUSHOVER_USER = process.env.PUSHOVER_USER;
const PUSHOVER_TOKEN = process.env.PUSHOVER_TOKEN;

// 🎯 Ziel
const BEST_DATE = new Date("2026-04-30");
const OK_DATE = new Date("2026-05-15");

// merkt sich letzten besseren Termin
let lastNotified = null;

// 📲 Push senden
async function sendPush(title, message) {
  try {
    await axios.post("https://api.pushover.net/1/messages.json", {
      token: PUSHOVER_TOKEN,
      user: PUSHOVER_USER,
      title,
      message,
      priority: 1
    });
    console.log("Push gesendet:", title);
  } catch (err) {
    console.error("Push Fehler:", err.message);
  }
}

// 🔍 Haupt-Check
async function check() {
  let browser;

  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu"
      ]
    });

    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto("https://lbv-termine.de/frontend/index.php", {
      waitUntil: "domcontentloaded"
    });

    // Popup schließen
    await page.locator('button:has-text("Verstanden")')
      .click({ timeout: 3000 })
      .catch(() => {});

    // Flow klicken
    await page.click('text=Führerschein');
    await page.click('text=Neuerteilung nach Entzug');
    await page.click('text=weiter zur Terminvereinbarung');

    await page.check('input[type="checkbox"]');
    await page.click('text=weiter');

    await page.fill('input[name="vorname"]', "Max");
    await page.fill('input[name="nachname"]', "Mustermann");
    await page.fill('input[name="email"]', "test@test.de");

    await page.click('text=weiter zur Standortauswahl');

    // Warten bis Datum sichtbar
    await page.waitForSelector("text=Termine verfügbar ab", { timeout: 10000 });

    const text = await page.textContent("body");
    const match = text.match(/Termine verfügbar ab (\d{2}\.\d{2}\.\d{4})/);

    if (!match) {
      console.log("Kein Termintext gefunden");
      return;
    }

    const [day, month, year] = match[1].split(".");
    const foundDate = new Date(`${year}-${month}-${day}`);

    console.log("Gefunden:", match[1]);

    // ❌ Spam verhindern
    if (lastNotified && foundDate >= lastNotified) {
      console.log("Kein besserer Termin");
      return;
    }

    // 🔥 TOP
    if (foundDate <= BEST_DATE) {
      await sendPush(
        "🔥 TOP TERMIN!",
        `📅 ${match[1]}\nJETZT BUCHEN:\nhttps://lbv-termine.de`
      );
      lastNotified = foundDate;
    }
    // ⚡ OK
    else if (foundDate <= OK_DATE) {
      await sendPush(
        "⚡ Früher Termin verfügbar",
        `📅 ${match[1]}\nhttps://lbv-termine.de`
      );
      lastNotified = foundDate;
    } else {
      console.log("Noch zu spät");
    }

  } catch (err) {
    console.error("Fehler im Check:", err.message);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// 🔁 Alle 10 Minuten
setInterval(check, 10 * 60 * 1000);

// ▶️ Direkt beim Start
check();
