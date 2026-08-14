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

// Default: only the 3 fast test dishes are included -> short meal.
const heroTime = await page.textContent('.hero-time');
console.log('hero time (default = test meal, expect ~0:1x):', heroTime.trim());
const lanes = await page.$$eval('.gantt-row', (n) => n.length);
console.log('gantt lanes total (all dishes, expect 10):', lanes);
const checksOn = await page.$$eval('.dish-check.on', (n) => n.length);
console.log('checked dishes (expect 3):', checksOn);
const excluded = await page.$$eval('.gantt-row.excluded', (n) => n.length);
console.log('excluded lanes (expect 7):', excluded);

// No page scroll.
const scroll = await page.evaluate(() => ({
  scrollH: document.body.scrollHeight, client: document.documentElement.clientHeight,
  overflowY: getComputedStyle(document.body).overflowY,
}));
console.log('no-scroll check:', JSON.stringify(scroll), '=>', scroll.scrollH <= scroll.client + 1 ? 'FITS' : 'SCROLLS');

// Included dishes end together at 100% of the timeline.
const ends = await page.$$eval('.gantt-row', (rows) => rows
  .filter((r) => r.querySelector('.gseg'))
  .map((r) => {
    const segs = [...r.querySelectorAll('.gseg')];
    const last = segs[segs.length - 1];
    return Math.round((parseFloat(last.style.left) + parseFloat(last.style.width)) * 10) / 10;
  }));
console.log('included dish end % (all 100):', JSON.stringify(ends),
  '=>', ends.length === 3 && ends.every((e) => Math.abs(e - 100) < 0.5) ? 'ALL FINISH TOGETHER ✓' : 'CHECK');

await page.screenshot({ path: 'tools/shot-idle.png' });

// Toggle a checkbox: include a BBQ dish -> included count changes, meal grows.
await page.click('.gantt-row:first-child .dish-check');
await page.waitForTimeout(150);
const checksAfter = await page.$$eval('.dish-check.on', (n) => n.length);
const heroAfterToggle = await page.textContent('.hero-time');
console.log('after including 1 dish -> checked:', checksAfter, '| hero:', heroAfterToggle.trim());
// undo
await page.click('.gantt-row:first-child .dish-check');
await page.waitForTimeout(100);

// Start the (test) meal
await page.click('#start-btn');
await page.waitForTimeout(400);
const runningLanes = await page.$$eval('.gantt-row', (n) => n.length);
console.log('lanes while running (only included, expect 3):', runningLanes);
const nowline = await page.$('.gantt-nowline');
console.log('now-line present:', !!nowline);

// Guided model: exactly one action card + a "Tap when complete" button.
const actionCards = await page.$$eval('.action', (n) => n.length);
const doneBtn = await page.$('#done-btn');
const progLabel1 = (await page.textContent('.hero-clock')).trim();
console.log('action cards (expect 1):', actionCards, '| done-btn:', !!doneBtn, '| progress:', progLabel1);
const actionTitle = await page.textContent('.action-text strong');
console.log('current task:', actionTitle.trim());

// Complete the current task -> progress advances, a done block appears.
await page.click('#done-btn');
await page.waitForTimeout(200);
const progLabel2 = (await page.textContent('.hero-clock')).trim();
const doneBlocks = await page.$$eval('.gseg.done', (n) => n.length);
console.log('after tapping complete -> progress:', progLabel2, '| done blocks:', doneBlocks);
await page.screenshot({ path: 'tools/shot-running.png' });

// Persistence across reload (completion + elapsed both survive).
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(300);
const progAfterReload = (await page.textContent('.hero-clock')).trim();
console.log('progress after reload (should keep completions):', progAfterReload);

// Editor opens and lists all dishes.
await page.click('#edit-btn');
await page.waitForTimeout(200);
const edDishes = await page.$$eval('.ed-dish', (n) => n.length);
console.log('editor opens, dishes listed:', edDishes);
await page.click('#editor-close');

// Done state: mark every included step complete.
await page.evaluate(() => {
  const doneSteps = {};
  for (const id of ['test-chicken', 'test-rice', 'test-veggies']) for (let i = 0; i < 3; i++) doneSteps[`${id}:${i}`] = 1000;
  localStorage.setItem('cook-with-me:run', JSON.stringify({ started: true, runningSince: Date.now() - 60000, accumMs: 0, doneSteps }));
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(300);
console.log('done hero:', (await page.textContent('.hero-time')).trim());

console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console/page errors');
await browser.close();
