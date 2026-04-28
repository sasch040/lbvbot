import { chromium } from "playwright";
import https from "https";
import { execSync } from "child_process";

const PUSHOVER_USER = process.env.PUSHOVER_USER;
const PUSHOVER_TOKEN = process.env.PUSHOVER_TOKEN;

// 🔔 Push
function sendPush(message) {
  return new Promise((resolve, reject) => {
    const data = new URLSearchParams({
      token: PUSHOVER_TOKEN,
      user: PUSHOVER_USER,
      message
    }).toString();

    const req = https.request(
      {
        hostname: "api.pushover.net",
        path: "/1/messages.json",
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(data)
        }
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          console.log("PUSH:", body);
          resolve(body);
        });
      }
    );

    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

// 🔧 Browser sicherstellen
async function ensureBrowserInstalled() {
  try {
    const browser = await chromium.launch();
    await browser.close();
  } catch {
    execSync("npx playwright install chromium", { stdio: "inherit" });
  }
}

// 📅 Datum-Helper
function parseDate(str) {
  const [d, m, y] = str.split(".");
  return new Date(`${y}-${m}-${d}`);
}

// 🎯 Zielbereich
const FROM = new Date("2026-04-28");
const TO = new Date("2026-05-25");

// 🔁 Zustand
let lastFoundDate = null;
let foundToday = false;
let lastDay = new Date().getDate();

// 🔍 Check
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

    await page.waitForTimeout(3000);

    const html = await page.content();

    const match = html.match(/Termin verfügbar ab\s*(\d{2}\.\d{2}\.\d{4})/);

    if (match) {
      const datumStr = match[1];
      const datum = parseDate(datumStr);

      console.log("Gefunden:", datumStr);

      // 👉 nur wenn im gewünschten Bereich
      if (datum >= FROM && datum <= TO) {
        foundToday = true;

        if (datumStr !== lastFoundDate) {
          await sendPush(`🚨 Termin verfügbar am ${datumStr}`);
          lastFoundDate = datumStr;
        } else {
          console.log("Schon gemeldet");
        }
      } else {
        console.log("Termin außerhalb Bereich");
      }

    } else {
      console.log("Kein Termin gefunden");
    }

  } catch (e) {
    console.log("Fehler:", e.message);
  }

  await browser.close();
}

// 📅 Tagesabschluss (21:00)
async function dailyCheck() {
  const now = new Date();

  const currentDay = now.getDate();

  // neuer Tag → reset
  if (currentDay !== lastDay) {
    foundToday = false;
    lastDay = currentDay;
  }

  // 👉 21:00 Uhr
  if (now.getHours() === 21 && now.getMinutes() < 10) {
    if (!foundToday) {
      await sendPush("😕 Heute kein passender Termin gefunden");
      foundToday = true; // verhindert doppelte Meldung
    }
  }
}

// 🚀 Start
async function run() {
  await ensureBrowserInstalled();

  while (true) {
    await check();
    await dailyCheck();

    await new Promise(r => setTimeout(r, 10 * 60 * 1000)); // 10 Minuten
  }
}

run();