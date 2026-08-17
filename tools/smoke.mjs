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

console.log('version shown:', (await page.textContent('#version')).trim());

// Picker launches at startup: 3 dishes, all selected.
const pickerOpen = await page.isVisible('#picker .editor-panel');
const pickRows = await page.$$eval('.pick-row', (n) => n.length);
const pickOn = await page.$$eval('.pick-row.on', (n) => n.length);
console.log('picker at startup:', pickerOpen, '| dishes (expect 3):', pickRows, '| selected (expect 3):', pickOn);
await page.screenshot({ path: 'tools/shot-picker.png' });

// Toggle one off then back on.
await page.click('.pick-row:first-child');
await page.waitForTimeout(100);
console.log('after unchecking one -> selected:', await page.$$eval('.pick-row.on', (n) => n.length));
await page.click('.pick-row:first-child');
await page.waitForTimeout(80);

// Close the picker.
await page.click('#picker-done');
await page.waitForTimeout(150);
console.log('hero time (expect 21:00):', (await page.textContent('.hero-time')).trim());
console.log('gantt lanes (expect 3):', await page.$$eval('.gantt-row', (n) => n.length));

const scroll = await page.evaluate(() => ({
  scrollH: document.body.scrollHeight, client: document.documentElement.clientHeight,
}));
console.log('idle no-scroll:', scroll.scrollH <= scroll.client + 1 ? 'FITS' : `SCROLLS (${scroll.scrollH}>${scroll.client})`);

const ends = await page.$$eval('.gantt-row', (rows) => rows
  .filter((r) => r.querySelector('.gseg'))
  .map((r) => {
    const segs = [...r.querySelectorAll('.gseg')];
    const last = segs[segs.length - 1];
    return Math.round((parseFloat(last.style.left) + parseFloat(last.style.width)) * 10) / 10;
  }));
console.log('dish end % (all 100):', JSON.stringify(ends),
  '=>', ends.length === 3 && ends.every((e) => Math.abs(e - 100) < 0.5) ? 'ALL FINISH TOGETHER ✓' : 'CHECK');
await page.screenshot({ path: 'tools/shot-idle.png' });

// Start.
await page.click('#start-btn');
await page.waitForTimeout(400);
console.log('lanes running:', await page.$$eval('.gantt-row', (n) => n.length), '| now-line:', !!(await page.$('.gantt-nowline')));

// Top = full prep to-do list (all 4 prep items). Order: chicken cooks first.
const prepItems = await page.$$eval('.prep-todo .pt-item', (ns) => ns.length);
const firstPrep = (await page.textContent('.prep-todo .pt-item.current .pt-text b')).trim();
console.log('prep to-do items (expect 4):', prepItems, '| current (expect Prep & season chicken):', firstPrep);
// Every timed step block carries an info icon.
console.log('step info icons present:', await page.$$eval('.gseg .seg-i', (n) => n.length), '(should be > 0)');
// Timed bar = current timed task (chicken Preheat BBQ).
console.log('timed bar:', (await page.$eval('.timed-now', (n) => n.textContent).catch(() => '(none)')).replace(/\s+/g, ' ').trim());
// Every dish has prep -> 3 pending prep badges.
console.log('lanes with prep-pending badge (expect 3):', await page.$$eval('.lane-prep.pending', (n) => n.length));

const runScroll = await page.evaluate(() => ({
  scrollH: document.body.scrollHeight, client: document.documentElement.clientHeight,
}));
console.log('running no-scroll:', runScroll.scrollH <= runScroll.client + 1 ? 'FITS' : `SCROLLS (${runScroll.scrollH}>${runScroll.client})`);
await page.screenshot({ path: 'tools/shot-prep.png' });

// Tap a step block -> its details show in the header detail line.
await page.click('.gantt-row:first-child .gseg');
await page.waitForTimeout(120);
console.log('tapped step detail:', (await page.$eval('.gantt-detail', (n) => n.textContent).catch(() => '(none)')).replace(/\s+/g, ' ').trim());

// Complete all 4 prep tasks via the to-do checkboxes.
let clicks = 0;
while ((await page.$('.pt-item:not(.done) .pt-check')) && clicks < 8) {
  await page.click('.pt-item:not(.done) .pt-check'); await page.waitForTimeout(80); clicks++;
}
console.log('completed prep tasks:', clicks, '| all prep done:', (await page.$$eval('.pt-item.done', (n) => n.length)),
  '| lanes prep-ready (expect 3):', await page.$$eval('.lane-prep.done', (n) => n.length));

// Complete a timed task -> a done block appears.
await page.click('#timed-done');
await page.waitForTimeout(150);
console.log('after a timed task -> done blocks:', await page.$$eval('.gseg.done', (n) => n.length),
  '| progress:', (await page.textContent('.hero-clock')).trim());
await page.screenshot({ path: 'tools/shot-running.png' });

// Wait state: everything done except rice's timed "Cook rice" (gated, not yet due).
await page.evaluate(() => {
  const doneSteps = {};
  for (let i = 0; i < 4; i++) doneSteps[`chicken:${i}`] = 200;
  for (let i = 0; i < 3; i++) doneSteps[`veggies:${i}`] = 200;
  doneSteps['rice:0'] = 200; doneSteps['rice:1'] = 200; // rice preps done, Cook rice pending
  localStorage.setItem('cook-with-me:run', JSON.stringify({ started: true, runningSince: Date.now() - 60000, accumMs: 0, doneSteps }));
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(200);
console.log('timed wait message:', (await page.$eval('.timed-now.wait', (n) => n.textContent).catch(() => '(none)')).replace(/\s+/g, ' ').trim());
await page.screenshot({ path: 'tools/shot-wait.png' });

// Persistence across reload.
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(200);
console.log('progress after reload:', (await page.textContent('.hero-clock')).trim());

// Editor.
await page.click('#edit-btn');
await page.waitForTimeout(200);
console.log('editor dishes:', await page.$$eval('.ed-dish', (n) => n.length),
  '| prep toggles:', (await page.$$eval('.ed-step-prep-cb', (n) => n.length)) > 0);
await page.click('#editor-close');

// Done state: mark every step complete.
await page.evaluate(() => {
  const doneSteps = {};
  const counts = { chicken: 4, rice: 3, veggies: 3 };
  for (const id in counts) for (let i = 0; i < counts[id]; i++) doneSteps[`${id}:${i}`] = 1000;
  localStorage.setItem('cook-with-me:run', JSON.stringify({ started: true, runningSince: Date.now() - 60000, accumMs: 0, doneSteps }));
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(200);
console.log('done hero:', (await page.textContent('.hero-time')).trim());

console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console/page errors');
await browser.close();
