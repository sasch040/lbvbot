const { chromium } = require("playwright");

const PUSHOVER_USER = process.env.PUSHOVER_USER;
const PUSHOVER_TOKEN = process.env.PUSHOVER_TOKEN;

// 👉 Zieltermin (hier anpassen)
const TARGET_DATE = new Date("2026-05-15");

// 👉 Debug damit du sicher siehst dass es läuft
const DEBUG_DATE = new Date("2026-06-30");

async function sendPush(message) {
  try {
    await fetch("https://api.pushover.net/1/messages.json", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
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
      waitUntil: "domcontentloaded",
      timeout: 60000
    });

    // Cookie Banner
    await page.locator('button:has-text("Verstanden")').click().catch(() => {});

    // Warten bis UI geladen ist
    await page.waitForTimeout(2000);

    // 👉 Führerschein (sichtbares Element sicher klicken)
    await page.locator('text=Führerschein').first().click();

    // 👉 Neuerteilung
    await page.locator('text=Neuerteilung nach Entzug').first().click();

    // 👉 Weiter
    await page.locator('text=weiter zur Terminvereinbarung').click();

    // 👉 Checkbox
    await page.locator('input[type="checkbox"]').check();

    // 👉 Weiter
    await page.locator('text=weiter').click();

    // 👉 Formular
    await page.fill('input[name="vorname"]', "Max");
    await page.fill('input[name="nachname"]', "Mustermann");
    await page.fill('input[name="email"]', "test@test.de");

    await page.locator('text=weiter zur Standortauswahl').click();

    // 👉 Warten bis Termine geladen sind
    await page.waitForTimeout(5000);

    const text = await page.textContent("body");

    const match = text.match(/(\d{2}\.\d{2}\.\d{4})/);

    if (!match) {
      console.log("❌ Kein Datum gefunden");
      await browser.close();
      return;
    }

    const [d, m, y] = match[1].split(".");
    const foundDate = new Date(`${y}-${m}-${d}`);

    console.log("Gefundenes Datum:", match[1]);

    // 👉 DEBUG Push (immer wenn etwas gefunden wird)
    if (foundDate <= DEBUG_DATE) {
      await sendPush(`🧪 DEBUG Termin: ${match[1]}`);
    }

    // 👉 Echter Trigger
    if (foundDate < TARGET_DATE) {
      await sendPush(`🔥 Termin verfügbar: ${match[1]}`);
    }

  } catch (e) {
    console.log("❌ Fehler:", e.message);
  }

  await browser.close();
}

// Loop
(async () => {
  while (true) {
    await check();
    await new Promise(r => setTimeout(r, 600000)); // 10 Minuten
  }
})();