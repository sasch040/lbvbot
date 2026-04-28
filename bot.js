import { chromium } from "playwright";
import https from "https";

const PUSHOVER_USER = process.env.PUSHOVER_USER;
const PUSHOVER_TOKEN = process.env.PUSHOVER_TOKEN;

async function sendPush(message) {
  const data = JSON.stringify({
    token: PUSHOVER_TOKEN,
    user: PUSHOVER_USER,
    message
  });

  const req = https.request(
    {
      hostname: "api.pushover.net",
      path: "/1/messages.json",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": data.length
      }
    },
    (res) => {
      res.on("data", () => {});
    }
  );

  req.write(data);
  req.end();
}

async function ensureBrowserInstalled() {
  try {
    const browser = await chromium.launch();
    await browser.close();
    console.log("Browser vorhanden ✅");
  } catch (e) {
    console.log("Browser fehlt → installiere jetzt...");

    const { execSync } = await import("child_process");
    execSync("npx playwright install chromium", { stdio: "inherit" });

    console.log("Browser installiert ✅");
  }
}

async function check() {
  console.log("Check startet:", new Date().toLocaleTimeString());

  const browser = await chromium.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const page = await browser.newPage();

  await page.goto("https://www.hamburg.de/lbv/terminvereinbarung/", {
    waitUntil: "networkidle"
  });

  // WICHTIG: stabiler selector
  await page.waitForTimeout(3000);

  const content = await page.content();

  if (content.includes("Juni")) {
    console.log("Termin im Juni gefunden!");
    await sendPush("🚨 Termin im Juni verfügbar!");
  } else {
    console.log("Kein Termin im Juni gefunden");
  }

  await browser.close();
}

async function run() {
  await ensureBrowserInstalled();

  // läuft alle 2 Minuten
  setInterval(check, 2 * 60 * 1000);

  await check();
}

run();