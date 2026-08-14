const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  await page.setViewport({ width: 1280, height: 720 });
  await page.goto('http://localhost:5174/', { waitUntil: 'networkidle0' });
  
  // Wait a bit for React Three Fiber to load
  await new Promise(r => setTimeout(r, 4000));
  
  await page.screenshot({ path: '/Users/bhavyakumarsoni/.gemini/antigravity-ide/scratch/sparshika3d/screenshot.png' });
  
  await browser.close();
  console.log("Screenshot saved to screenshot.png");
})();
