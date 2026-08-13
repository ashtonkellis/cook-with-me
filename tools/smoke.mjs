import pkg from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pkg;

const errors = [];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

await page.goto('http://localhost:8123/', { waitUntil: 'networkidle' });
await page.waitForTimeout(300);

const version = await page.textContent('#version');
console.log('version shown:', version.trim());
const heroTime = await page.textContent('.hero-time');
console.log('hero time (expect 21:00):', heroTime.trim());
const dishCount = await page.$$eval('.dish', (n) => n.length);
console.log('dish cards (expect 3):', dishCount);
const startLabels = await page.$$eval('.dish-title small', (ns) => ns.map((n) => n.textContent));
console.log('dish sublabels:', startLabels);

await page.screenshot({ path: 'tools/shot-idle.png' });

// Start the meal
await page.click('#start-btn');
await page.waitForTimeout(600);
const nextStep = await page.textContent('.next-step');
console.log('next-step block:', nextStep.replace(/\s+/g, ' ').trim());
const pills = await page.$$eval('.pill', (ns) => ns.map((n) => n.textContent));
console.log('pills after start:', pills);
await page.screenshot({ path: 'tools/shot-running.png' });

// Reload to prove persistence (timer should NOT reset)
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(300);
const heroAfterReload = await page.textContent('.hero-time');
console.log('hero after reload (should be <21:00, still running):', heroAfterReload.trim());

// Editor opens
await page.click('#edit-btn');
await page.waitForTimeout(200);
const editorVisible = await page.isVisible('.editor-panel');
console.log('editor opens:', editorVisible);
await page.click('#editor-close');

// Done state: pretend the meal started 25 min ago
await page.evaluate(() => {
  localStorage.setItem('cook-with-me:run', JSON.stringify({ started: true, runningSince: Date.now() - 25 * 60000, accumMs: 0 }));
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(300);
const doneHero = await page.textContent('.hero-time');
const donePills = await page.$$eval('.pill', (ns) => ns.map((n) => n.textContent));
console.log('done hero (expect Ready):', doneHero.trim(), '| pills:', donePills);

console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console/page errors');
await browser.close();
