import { chromium } from "playwright";
import https from "https";
import { execSync } from "child_process";

const PUSHOVER_USER = process.env.PUSHOVER_USER;
const PUSHOVER_TOKEN = process.env.PUSHOVER_TOKEN;

// 🔔 Push Funktion (100% korrekt)
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

// 🔍 Termin Check
async function check() {
  console.log("Check startet:", new Date().toLocaleTimeString());

  const browser = await chromium.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const page = await browser.newPage();

  await page.goto("https://www.hamburg.de/lbv/terminvereinbarung/", {
    waitUntil: "networkidle"
  });

  await page.waitForTimeout(3000);

  // 🔎 Alle Buttons prüfen
  const buttons = await page.$$eval("button", els =>
    els.map(el => el.innerText)
  );

  const juniTermine = buttons.filter(text =>
    text.toLowerCase().includes("juni")
  );

  if (juniTermine.length > 0) {
    console.log("ECHTER Termin im Juni gefunden!", juniTermine);

    await sendPush(
      "🚨 LBV Termin im Juni verfügbar!\n\n" +
      juniTermine.join("\n")
    );
  } else {
    console.log("Kein echter Termin im Juni gefunden");
  }

  await browser.close();
}

// 🚀 Start
async function run() {
  console.log("ENV CHECK:");
  console.log("USER:", PUSHOVER_USER);
  console.log("TOKEN:", PUSHOVER_TOKEN);

  await ensureBrowserInstalled();

  // 🔔 TEST PUSH
  await sendPush("✅ Bot gestartet und verbunden!");

  // ⏱ alle 2 Minuten
  setInterval(check, 2 * 60 * 1000);

  // sofortiger Check
  await check();
}

run();