const puppeteer = require('puppeteer');
const path = require('path');
const OUT = path.join('C:\\Users\\GrahamClark\\argus-backend', 'screenshots');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox','--disable-setuid-sandbox','--disable-gpu'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });

  await page.goto('http://localhost:3001', { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 1500));
  await page.evaluate(() => { window.__argus && window.__argus.setV({ view: 'health' }); });
  await new Promise(r => setTimeout(r, 2000));

  await page.evaluate(() => {
    const sel = document.getElementById('sfAccountSelector');
    const target = Array.from(sel.options).find(o => /cip|copenhagen infrastructure/i.test(o.text));
    if (target) { sel.value = target.value; sel.dispatchEvent(new Event('change', { bubbles: true })); }
  });

  // Wait until the SF loading text is gone
  await page.waitForFunction(() => {
    const els = Array.from(document.querySelectorAll('*'));
    return !els.some(el => el.childNodes.length === 1 && el.textContent.includes('Loading subscriptions'));
  }, { timeout: 25000 }).catch(() => console.log('SF load wait timed out'));

  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(OUT, '04-health-overview.png') });
  console.log('Shot 1: overview');

  await page.evaluate(() => window.scrollTo(0, 450));
  await new Promise(r => setTimeout(r, 800));
  await page.screenshot({ path: path.join(OUT, '05-health-widgets.png') });
  console.log('Shot 2: widgets');

  await browser.close();
  console.log('Done');
})();
