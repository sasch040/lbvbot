async function check() {
  console.log("Check:", new Date().toLocaleTimeString());

  const browser = await chromium.launch({
    args: ["--no-sandbox"]
  });

  const page = await browser.newPage();

  try {
    await page.goto("https://www.hamburg.de/lbv/terminvereinbarung/", {
      waitUntil: "networkidle"
    });

    await page.waitForTimeout(2000);

    // 👉 Führerschein klicken (wichtig!)
    await page.locator('text=Führerschein').first().click();

    await page.waitForTimeout(3000);

    const content = await page.content();

    const match = content.match(/Termin verfügbar ab\s*(\d{2}\.\d{2}\.\d{4})/);

    if (match) {
      const datumStr = match[1];
      const datum = parseDate(datumStr);

      // 🧾 IMMER LOGGEN
      console.log("Gefundener Termin:", datumStr);

      // 🎯 nur prüfen ob im gewünschten Bereich
      if (datum >= FROM && datum <= TO) {
        console.log("✅ Termin im gewünschten Bereich");

        foundToday = true;

        if (datumStr !== lastFoundDate) {
          await sendPush(`🚨 Termin verfügbar am ${datumStr}`);
          lastFoundDate = datumStr;
        }

      } else {
        console.log("❌ Termin NICHT im gewünschten Bereich");
      }

    } else {
      console.log("Kein Termin gefunden");
    }

  } catch (e) {
    console.log("Fehler:", e.message);
  }

  await browser.close();
}