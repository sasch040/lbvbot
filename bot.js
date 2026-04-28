import { chromium } from "playwright";
import https from "https";
import { execSync } from "child_process";

const PUSHOVER_USER = process.env.PUSHOVER_USER;
const PUSHOVER_TOKEN = process.env.PUSHOVER_TOKEN;

// 🔔 Push Funktion
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
    console.log("Browser vorhanden ✅");
  } catch (e) {
    console.log("Browser fehlt → installiere...");
    execSync("npx playwright install chromium", { stdio: "inherit" });
    console.log("Browser installiert ✅");
  }
}

// 🔁 verhindert doppelte Pushes
let lastState = null;

// 🔍 Check Funktion (ohne Monatsfilter)
async function check() {
  console.log("Check startet:", new Date().toLocaleTimeString());

  const browser = await chromium.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const page = await browser.newPage();

  try {
    await page.goto("https://www.hamburg.de/lbv/terminvereinbarung/", {
      waitUntil: "networkidle"
    });

    await page.waitForTimeout(3000);

    // 👉 gesamter Seiteninhalt
    const content = await page.content();

    // 👉 einfache Veränderungs-Erkennung
    if (content !== lastState) {
      console.log("Seite hat sich verändert");

      await sendPush("🔄 LBV Seite hat sich geändert – evtl. neuer Termin!");

      lastState = content;
    } else {
      console.log("Keine Änderung");
    }

  } catch (e) {
    console.log("Fehler:", e.message);
  }

  await browser.close();
}

// 🚀 Start – exakt alle 10 Minuten
async function run() {
  await ensureBrowserInstalled();

  while (true) {
    await check();
    await new Promise(r => setTimeout(r, 10 * 60 * 1000)); // 10 Minuten
  }
}

run();