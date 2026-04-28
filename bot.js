process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH || "0";

const { chromium } = require("playwright");

const URL = process.env.LBV_URL || "https://www.lbv-termine.de/frontend/index.php?behoerdenID=56";
const CHECK_INTERVAL_MINUTES = Number(process.env.CHECK_INTERVAL_MINUTES || 10);
const NO_MATCH_NOTIFY_HOUR = Number(process.env.NO_MATCH_NOTIFY_HOUR || 20);
const FROM = parseDate(process.env.FROM_DATE || "28.04.2026");
const TO = parseDate(process.env.TO_DATE || "25.05.2026");
const FIRST_NAME = process.env.APPOINTMENT_FIRST_NAME || "Peter";
const LAST_NAME = process.env.APPOINTMENT_LAST_NAME || "Lustig";
const EMAIL = process.env.APPOINTMENT_EMAIL || "asadfsf@gmail.com";

let lastFoundDate = null;
let lastNoMatchNotificationDay = null;
let lastMatchingAppointmentDay = null;

function log(message, data = {}) {
  const suffix = Object.keys(data).length ? ` ${JSON.stringify(data)}` : "";
  console.log(`[${new Date().toISOString()}] ${message}${suffix}`);
}

function parseDate(value) {
  const match = String(value).match(/^(\d{2})\.(\d{2})\.(\d{2}|\d{4})$/);

  if (!match) {
    throw new Error(`Ungueltiges Datum: ${value}. Erwartet wird TT.MM.JJ oder TT.MM.JJJJ`);
  }

  const [, day, month, year] = match;
  const fullYear = year.length === 2 ? Number(`20${year}`) : Number(year);
  return new Date(fullYear, Number(month) - 1, Number(day));
}

function formatDate(date) {
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(date);
}

function todayKey() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function berlinHour() {
  return Number(
    new Intl.DateTimeFormat("de-DE", {
      timeZone: "Europe/Berlin",
      hour: "2-digit",
      hour12: false
    }).format(new Date())
  );
}

async function sendMessage(text) {
  const token =
    process.env.PUSHOVER_API_TOKEN ||
    process.env.PUSHOVER_APP_TOKEN ||
    process.env.PUSHOVER_TOKEN ||
    process.env.PUSHOVER_KEY;
  const user = process.env.PUSHOVER_USER_KEY || process.env.PUSHOVER_USER;
  const device = process.env.PUSHOVER_DEVICE;

  if (!token || !user) {
    log("Pushover-Nachricht nicht gesendet, PUSHOVER_KEY oder PUSHOVER_USER fehlt", { text });
    return;
  }

  const body = new URLSearchParams({
    token,
    user,
    message: text,
    title: "LBV Terminbot"
  });

  if (device) {
    body.set("device", device);
  }

  const response = await fetch("https://api.pushover.net/1/messages.json", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });

  if (!response.ok) {
    const bodyText = await response.text();
    throw new Error(`Pushover konnte die Nachricht nicht senden: ${response.status} ${bodyText}`);
  }

  log("Pushover-Nachricht gesendet");
}

async function notifyNoMatchOncePerDay(statusText) {
  const key = todayKey();

  if (
    lastNoMatchNotificationDay === key ||
    lastMatchingAppointmentDay === key ||
    berlinHour() < NO_MATCH_NOTIFY_HOUR
  ) {
    return;
  }

  lastNoMatchNotificationDay = key;
  await sendMessage(
    `Heute wurde leider kein passender LBV-Termin gefunden. ${statusText} Gewuenschter Zeitraum: ${formatDate(FROM)} bis ${formatDate(TO)}.`
  );
}

async function clickIfVisible(locator, description) {
  const item = locator.first();

  if (!(await item.isVisible().catch(() => false))) {
    return false;
  }

  await item.click();
  log(`${description} geklickt`);
  return true;
}

async function clickButtonByName(page, namePattern, description) {
  const candidates = [
    page.getByRole("button", { name: namePattern }),
    page.getByRole("link", { name: namePattern }),
    page.locator("button, a, input[type='button'], input[type='submit']").filter({ hasText: namePattern })
  ];

  for (const candidate of candidates) {
    if (await clickIfVisible(candidate, description)) {
      await page.waitForLoadState("domcontentloaded").catch(() => {});
      await page.waitForTimeout(1000);
      return;
    }
  }

  throw new Error(`Button/Link nicht gefunden: ${description}`);
}

async function clickContinueToLocationSelection(page) {
  const candidates = [
    page.locator("input[type='submit'][value*='Standortauswahl']").first(),
    page.getByRole("button", { name: /weiter zur standortauswahl/i }).first(),
    page.locator("button").filter({ hasText: /weiter zur standortauswahl/i }).first()
  ];

  for (const button of candidates) {
    if (await button.isVisible().catch(() => false)) {
      const navigation = page.waitForURL(/standortauswahl\.php/i, { timeout: 30000 }).catch(() => null);
      await button.click();
      log("Weiter zur Standortauswahl geklickt");
      const locationUrlReached = Boolean(await navigation);
      await page.waitForLoadState("domcontentloaded").catch(() => {});
      await page.waitForTimeout(3000);
      const sample = await page
        .locator("body")
        .innerText({ timeout: 10000 })
        .then((text) => text.slice(0, 700).replace(/\s+/g, " "))
        .catch((error) => `Seitentext konnte nicht gelesen werden: ${error.message}`);

      log("Nach Klick auf Weiter zur Standortauswahl", {
        url: page.url(),
        locationUrlReached,
        sample
      });
      return;
    }
  }

  throw new Error("Button nicht gefunden: Weiter zur Standortauswahl");
}

async function clickButtonInSection(page, sectionPattern, buttonPattern, description) {
  const labels = page.getByText(sectionPattern);
  const count = await labels.count();

  for (let index = 0; index < count; index += 1) {
    const label = labels.nth(index);

    if (!(await label.isVisible().catch(() => false))) {
      continue;
    }

    const labelHandle = await label.elementHandle();
    const buttonHandle = await labelHandle.evaluateHandle((element, source) => {
      const pattern = new RegExp(source, "i");
      let current = element;

      while (current && current !== document.body) {
        const button = [...current.querySelectorAll("button, a, input[type='button'], input[type='submit']")]
          .find((candidate) => pattern.test(candidate.innerText || candidate.value || ""));

        if (button) {
          return button;
        }

        current = current.parentElement;
      }

      return null;
    }, buttonPattern.source);

    const button = buttonHandle.asElement();

    if (button) {
      await button.click();
      log(`${description} geklickt`);
      await page.waitForLoadState("domcontentloaded").catch(() => {});
      await page.waitForTimeout(1000);
      return;
    }
  }

  throw new Error(`Abschnitt nicht gefunden: ${description}`);
}

async function closeInitialNotice(page) {
  const closePatterns = [
    /verstanden.*schlie/i,
    /akzeptier/i,
    /schlie/i
  ];

  for (const pattern of closePatterns) {
    const clicked = await clickIfVisible(page.getByRole("button", { name: pattern }), "Hinweisfenster");
    if (clicked) {
      await page.waitForTimeout(1000);
      return;
    }
  }

  log("Kein Hinweisfenster sichtbar");
}

async function acceptPrivacyAndContinue(page) {
  const privacyCheckboxes = [
    page.getByLabel(/datenschutzerkl/i),
    page.locator("input[type='checkbox']").first()
  ];

  for (const checkbox of privacyCheckboxes) {
    if (await checkbox.first().isVisible().catch(() => false)) {
      await checkbox.first().check();
      log("Datenschutzerklaerung bestaetigt");
      break;
    }
  }

  await clickButtonByName(page, /weiter/i, "Weiter nach Datenschutzerklaerung");
}

async function fillPersonalDataAndContinue(page) {
  await page.locator("input[name='vorname']").fill(FIRST_NAME);
  await page.locator("input[name='nachname']").fill(LAST_NAME);
  await page.locator("#email").fill(EMAIL);

  log("Kontaktdaten eingetragen", { firstName: FIRST_NAME, lastName: LAST_NAME, email: EMAIL });

  await clickContinueToLocationSelection(page);
}

async function openAppointmentDatePage(page) {
  log("Oeffne Hamburg-LBV-Terminseite", { url: URL });
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  log("Hamburg-Seite geladen", { title: await page.title(), url: page.url() });

  await closeInitialNotice(page);

  await clickButtonInSection(
    page,
    /f\u00fchrerschein/i,
    /ausw\u00e4hlen/i,
    "Kategorie Fuehrerschein auswaehlen"
  );

  await clickButtonInSection(
    page,
    /neuerteilung nach entzug\s*\(beratung\)/i,
    /zum vor-ort-termin/i,
    "Neuerteilung nach Entzug Beratung zum Vor-Ort-Termin"
  );

  await clickButtonByName(page, /weiter zur terminvereinbarung/i, "Weiter zur Terminvereinbarung");
  await acceptPrivacyAndContinue(page);
  await fillPersonalDataAndContinue(page);

  await page.waitForLoadState("domcontentloaded").catch(() => {});
  await page.waitForTimeout(3000);
  log("Standortauswahl erreicht", { url: page.url(), title: await page.title() });
}

function extractEarliestAppointmentDate(content) {
  const match = content.match(/Termine?\s+verf\u00fcgbar\s+ab\s*(\d{2}\.\d{2}\.\d{4})/i);
  return match ? match[1] : null;
}

async function check() {
  log("Starte Terminpruefung", {
    range: `${formatDate(FROM)} - ${formatDate(TO)}`,
    intervalMinutes: CHECK_INTERVAL_MINUTES
  });

  let browser;
  let page;

  try {
    browser = await chromium.launch({
      args: ["--no-sandbox", "--disable-dev-shm-usage"]
    });

    page = await browser.newPage({
      locale: "de-DE",
      viewport: { width: 1366, height: 900 }
    });

    await openAppointmentDatePage(page);

    const content = await page.locator("body").innerText({ timeout: 15000 });
    const dateText = extractEarliestAppointmentDate(content);

    if (!dateText) {
      log("Kein Termin-Datum ausgelesen, deshalb wird keine Kein-Treffer-Nachricht gesendet", {
        url: page.url(),
        sample: content.slice(0, 700).replace(/\s+/g, " ")
      });
      return;
    }

    const availableDate = parseDate(dateText);
    log("ERFOLG: Standortauswahl mit fruehestmoeglichem Termin erreicht", {
      ausgelesenesDatum: dateText,
      url: page.url()
    });

    if (availableDate >= FROM && availableDate <= TO) {
      log("Passender Termin gefunden", { ausgelesenesDatum: dateText });
      lastMatchingAppointmentDay = todayKey();

      if (dateText !== lastFoundDate) {
        await sendMessage(`LBV-Termin verfuegbar am ${dateText}`);
        lastFoundDate = dateText;
      } else {
        log("Passender Termin wurde bereits gemeldet", { ausgelesenesDatum: dateText });
      }

      return;
    }

    log("Termin ausgelesen, aber nicht im gewuenschten Zeitraum", {
      ausgelesenesDatum: dateText,
      gewuenschtVon: formatDate(FROM),
      gewuenschtBis: formatDate(TO)
    });
    await notifyNoMatchOncePerDay(`Ausgelesenes Datum: ${dateText}.`);
  } catch (error) {
    log("Fehler bei Terminpruefung", { message: error.message, url: page ? page.url() : null });
  } finally {
    if (browser) {
      await browser.close();
    }
    log("Terminpruefung beendet");
  }
}

async function main() {
  log("LBV-Bot gestartet", {
    from: formatDate(FROM),
    to: formatDate(TO),
    checkIntervalMinutes: CHECK_INTERVAL_MINUTES,
    noMatchNotifyHour: NO_MATCH_NOTIFY_HOUR
  });

  await check();
  log("Naechste Terminpruefung geplant", { inMinutes: CHECK_INTERVAL_MINUTES });
  setInterval(() => {
    check()
      .catch((error) => {
        log("Unerwarteter Fehler ausserhalb der Terminpruefung", { message: error.message });
      })
      .finally(() => {
        log("Naechste Terminpruefung geplant", { inMinutes: CHECK_INTERVAL_MINUTES });
      });
  }, CHECK_INTERVAL_MINUTES * 60 * 1000);
}

main().catch((error) => {
  log("Bot konnte nicht gestartet werden", { message: error.message });
  process.exit(1);
});
