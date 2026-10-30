// Renders mizan-motion.html frame by frame to PNGs, then encode.py makes the MP4.
// Needs playwright-core and a Chromium browser (Edge here):
//   npm i --no-save playwright-core
//   node render.mjs <out-dir> [fps=30] [only-these-seconds,comma,separated]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(process.argv[2] || join(here, "frames"));
const fps = Number(process.argv[3] || 30);
const only = process.argv[4] ? process.argv[4].split(",").map(Number) : null;
const DUR = 63;
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || "msedge" });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(join(here, "mizan-motion.html")).href + "?render");
await page.evaluate(() => window.ready);

const times = only ?? Array.from({ length: Math.round(DUR * fps) }, (_, i) => i / fps);
for (const [i, t] of times.entries()) {
  await page.evaluate((t) => window.seek(t), t);
  const name = only ? `t${String(t).replace(".", "_")}.png` : `f${String(i).padStart(5, "0")}.png`;
  await page.screenshot({ path: join(out, name), clip: { x: 0, y: 0, width: 1920, height: 1080 } });
  if (!only && i % 150 === 0) console.log(`frame ${i}/${times.length}`);
}
await browser.close();
console.log("done", out);
