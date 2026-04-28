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
          console.log("PUSH RESPONSE:", body);
          resolve(body);
        });
      }
    );

    req.on("error", (err) => {
      console.error("PUSH ERROR:", err);
      reject(err);
    });

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

// 🔁 Zustand
let lastState = null;
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

    const content = await page.content();

    // 👉 wenn sich etwas ändert → möglicher Termin
    if (content !== lastState) {
      console.log("Änderung erkannt");

      foundToday = true;

      await sendPush("🔄 LBV Änderung erkannt – prüf manuell!");

      lastState = content;
    }

  } catch (e) {
    console.log("Fehler:", e.message);
  }

  await browser.close();
}

// 📅 Tagesabschluss (z. B. 21:00 Uhr)
async function dailyCheck() {
  const now = new Date();

  const currentDay = now.getDate();

  // neuer Tag → reset
  if (currentDay !== lastDay) {
    foundToday = false;
    lastDay = currentDay;
  }

  // 👉 21:00 Uhr Check
  if (now.getHours() === 21 && now.getMinutes() === 0) {
    if (!foundToday) {
      await sendPush("😕 Heute wurde kein passender Termin gefunden.");
    } else {
      console.log("Heute gab es Treffer → keine Abschlussmeldung nötig");
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