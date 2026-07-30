/**
 * Argus screenshot capture — MDM, Health Card, SW Intelligence
 * Usage: node screenshot-argus.js
 * Output: ./screenshots/
 */

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const BASE = 'http://localhost:3001';
const OUT  = path.join(__dirname, 'screenshots');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT);

const VIEWPORT = { width: 1440, height: 900, deviceScaleFactor: 2 };

// Wait for a selector to appear and stabilise
async function waitFor(page, selector, timeout = 15000) {
  await page.waitForSelector(selector, { timeout });
  await new Promise(r => setTimeout(r, 800));
}

// Wait until network is quiet for at least 500ms
async function idle(page, extra = 1200) {
  await page.waitForNetworkIdle({ idleTime: 500, timeout: 20000 }).catch(() => {});
  await new Promise(r => setTimeout(r, extra));
}

async function shoot(page, name, extra = 0) {
  if (extra) await new Promise(r => setTimeout(r, extra));
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`  ✓ ${name}.png`);
  return file;
}

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport(VIEWPORT);

    // ── 1. MDM view ──────────────────────────────────────────────────────────
    console.log('\n[1/3] MDM view');
    await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 30000 });
    await idle(page, 1500);

    // Click MDM nav item
    await page.evaluate(() => {
      window.__argus && window.__argus.setV({ view: 'mdm' });
    });
    await idle(page, 2000);
    await shoot(page, '01-mdm-overview');

    // Search for TotalEnergies to show a rich expanded drilldown
    await page.evaluate(() => {
      const input = document.querySelector('input[placeholder*="SF name"], input[placeholder*="Search"]');
      if (input) {
        input.value = 'TotalEnergies';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    await new Promise(r => setTimeout(r, 500));
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Search');
      if (btn) btn.click();
    });
    await idle(page, 2000);
    // Expand the first result
    await page.evaluate(() => {
      const toggles = document.querySelectorAll('[onclick*="expand"], [onclick*="Expand"], td button, .expand-btn');
      if (toggles.length) { toggles[0].click(); return; }
      // fallback: click first account row chevron
      const chevrons = document.querySelectorAll('td:last-child');
      if (chevrons.length > 2) chevrons[2].click();
    });
    await new Promise(r => setTimeout(r, 1500));
    await shoot(page, '02-mdm-expanded');

    // ── 2. Health Card view ───────────────────────────────────────────────────
    console.log('\n[2/3] Health Card view');
    await page.evaluate(() => {
      window.__argus && window.__argus.setV({ view: 'health' });
    });
    await idle(page, 2000);
    await shoot(page, '03-health-loading');

    // Pick a large account with rich data across all 4 widgets
    const loaded = await page.evaluate(async () => {
      const sel = document.getElementById('sfAccountSelector');
      if (!sel) return 'no-selector';
      const options = Array.from(sel.options);
      // Priority: accounts known to have SF + ZD + PB + PostHog data
      const priority = /totalenergies|rwe|enel|equinor|sse|shell|vattenfall|statkraft|orsted/i;
      const target = options.find(o => priority.test(o.text));
      if (target) {
        sel.value = target.value;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        return target.text;
      }
      if (options.length > 1) {
        sel.selectedIndex = 1;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        return options[1].text;
      }
      return 'no-accounts';
    });
    console.log(`    Account selected: ${loaded}`);
    await idle(page, 4000);
    await shoot(page, '04-health-overview');

    // Scroll down to show widget section
    await page.evaluate(() => window.scrollTo(0, 400));
    await new Promise(r => setTimeout(r, 600));
    await shoot(page, '05-health-widgets');

    // ── 3. SW Intelligence view ───────────────────────────────────────────────
    console.log('\n[3/3] SW Intelligence view');
    await page.evaluate(() => {
      window.__argus && window.__argus.setV({ view: 'swIntelligence' });
    });
    await idle(page, 2500);

    // SW Intelligence is an iframe — wait for charts to render
    await new Promise(r => setTimeout(r, 1000));
    let swFrame = page.frames().find(f => f.url().includes('sw-intelligence')) || null;
    if (!swFrame) {
      // iframe may not have loaded yet — wait
      await page.waitForFrame(f => f.url().includes('sw-intelligence'), { timeout: 10000 }).catch(() => {});
      swFrame = page.frames().find(f => f.url().includes('sw-intelligence')) || null;
    }
    if (swFrame) {
      await swFrame.waitForSelector('#main-content', { timeout: 15000 }).catch(() => {});
      await new Promise(r => setTimeout(r, 3000)); // let Chart.js render
    }
    await shoot(page, '06-sw-intelligence-overview');

    if (swFrame) {
      // Scroll down inside iframe to reveal region summary + ARR chart
      await swFrame.evaluate(() => window.scrollTo(0, 180));
      await new Promise(r => setTimeout(r, 800));
      await shoot(page, '06b-sw-intelligence-charts');

      // Account view tab
      await swFrame.evaluate(() => {
        const tab = Array.from(document.querySelectorAll('.nav-tab')).find(t => /account/i.test(t.textContent));
        if (tab) tab.click();
      });
      await new Promise(r => setTimeout(r, 1800));
      await shoot(page, '07-sw-intelligence-accounts');

      // Focus areas tab
      await swFrame.evaluate(() => {
        const tab = Array.from(document.querySelectorAll('.nav-tab')).find(t => /focus/i.test(t.textContent));
        if (tab) tab.click();
      });
      await new Promise(r => setTimeout(r, 1800));
      await shoot(page, '08-sw-intelligence-focus');

      // Client list tab
      await swFrame.evaluate(() => {
        const tab = Array.from(document.querySelectorAll('.nav-tab')).find(t => /client list/i.test(t.textContent));
        if (tab) tab.click();
      });
      await new Promise(r => setTimeout(r, 1800));
      await shoot(page, '09-sw-intelligence-clientlist');
    }

    console.log(`\nAll screenshots saved to: ${OUT}`);
    console.log(fs.readdirSync(OUT).map(f => `  ${f}`).join('\n'));

  } finally {
    await browser.close();
  }
})();
