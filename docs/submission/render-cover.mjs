// Renders cover.html to background.png (1920×900) for the submission form.
// Needs playwright-core and a Chromium browser (Edge here): node docs/submission/render-cover.mjs
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright-core";

const here = dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch({ channel: "msedge" });
const page = await browser.newPage({ viewport: { width: 1920, height: 900 } });
await page.goto(pathToFileURL(join(here, "cover.html")).href);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: join(here, "background.png"), clip: { x: 0, y: 0, width: 1920, height: 900 } });
await browser.close();
console.log("wrote", join(here, "background.png"));
