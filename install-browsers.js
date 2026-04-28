const { spawnSync } = require("node:child_process");

const command = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(command, ["playwright", "install", "chromium"], {
  env: {
    ...process.env,
    PLAYWRIGHT_BROWSERS_PATH: "0"
  },
  shell: false,
  stdio: "inherit"
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
