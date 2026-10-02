// Headless screenshot of the running dev server (npm run dev, then npm run screenshot).
//   SCREENSHOT_URL=http://localhost:5173/ SCREENSHOT_OUT=shot.png npm run screenshot
const path = require('path');
const puppeteer = require('puppeteer');

const URL = process.env.SCREENSHOT_URL || 'http://localhost:5173/';
const OUT = path.resolve(process.env.SCREENSHOT_OUT || 'screenshot.png');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  await page.setViewport({ width: 1280, height: 720 });
  await page.goto(URL, { waitUntil: 'networkidle0' });

  // Wait a bit for React Three Fiber to load
  await new Promise((r) => setTimeout(r, 4000));

  await page.screenshot({ path: OUT });
  await browser.close();
  console.log(`Screenshot saved to ${OUT}`);
})();
