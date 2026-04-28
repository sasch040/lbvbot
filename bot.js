const { chromium } = require("playwright");

const PUSHOVER_USER = process.env.PUSHOVER_USER;
const PUSHOVER_TOKEN = process.env.PUSHOVER_TOKEN;

const TARGET_DATE = new Date("2026-05-15"); // alles davor ist gut

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
        title: "LBV Termin",
        message: message
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
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const page = await browser.newPage();

  try {
    await page.goto("https://lbv-termine.de/frontend/index.php", {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });

    // Datenschutz akzeptieren
    await page.waitForSelector('input[type="checkbox"]', { timeout: 10000 });
    await page.click('input[type="checkbox"]');
    await page.click('text=weiter');

    // Formular dummy ausfüllen
    await page.fill('input[placeholder="Vorname"]', "Test");
    await page.fill('input[placeholder="Nachname"]', "Test");
    await page.fill('input[placeholder="E-Mail"]', "test@test.de");
    await page.click('text=weiter zur Standortauswahl');

    // Führerschein auswählen
    await page.click('text=Führerschein');
    await page.waitForTimeout(1000);

    await page.click('text=Neuerteilung nach Entzug');
    await page.click('text=weiter zur Terminvereinbarung');

    await page.waitForTimeout(3000);

    const content = await page.content();

    // Datum extrahieren
    const match = content.match(/(\d{2}\.\d{2}\.\d{4})/);

    if (match) {
      const foundDateStr = match[1];
      console.log("Gefunden:", foundDateStr);

      const [day, month, year] = foundDateStr.split(".");
      const foundDate = new Date(`${year}-${month}-${day}`);

      if (foundDate < TARGET_DATE) {
        await sendPush(`🔥 Früher Termin gefunden: ${foundDateStr}`);
      }
    } else {
      console.log("Kein Datum gefunden");
    }

  } catch (err) {
    console.log("Fehler beim Check:", err.message);
  }

  await browser.close();
}

// 🔁 Endlosschleife
async function run() {
  while (true) {
    await check();

    console.log("Warte 10 Minuten...");
    await new Promise(r => setTimeout(r, 10 * 60 * 1000));
  }
}

run();
