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

// Picker at startup: 3 dishes, all selected.
console.log('picker at startup:', await page.isVisible('#picker .editor-panel'),
  '| dishes:', await page.$$eval('.pick-row', (n) => n.length),
  '| selected:', await page.$$eval('.pick-row.on', (n) => n.length));
await page.click('#picker-done');
await page.waitForTimeout(150);

// BEFORE cooking: TOP = prep to-do list (all 4 prep tasks), in Gantt/dish order.
const prepItems = await page.$$eval('.prep-todo .pt-item', (ns) => ns.length);
const prepOrder = await page.$$eval('.prep-todo .pt-item .pt-text b', (ns) => ns.map((n) => n.textContent.trim()));
console.log('prep to-do items before start (expect 4):', prepItems);
console.log('prep order (dish order — chicken, rice, rice, veggies):', JSON.stringify(prepOrder));

// BOTTOM: Start cooking button, no timed bar yet.
console.log('start-cooking button present:', !!(await page.$('#start-btn')),
  '| timed bar yet:', !!(await page.$('#timed-done')),
  '| gantt lanes:', await page.$$eval('.gantt-row', (n) => n.length));

const scroll1 = await page.evaluate(() => ({ s: document.body.scrollHeight, c: document.documentElement.clientHeight }));
console.log('idle no-scroll:', scroll1.s <= scroll1.c + 1 ? 'FITS' : `SCROLLS (${scroll1.s}>${scroll1.c})`);
await page.screenshot({ path: 'tools/shot-idle.png' });

// Prep can be done BEFORE cooking. Complete the first dish's prep -> its lane turns green.
await page.click('.prep-todo .pt-item:first-child .pt-check');
await page.waitForTimeout(120);
console.log('after prepping 1 dish (before cooking) -> prep-ready lanes:', await page.$$eval('.gantt-row.prep-ready', (n) => n.length),
  '| still not cooking:', !(await page.$('#timed-done')));

// Complete all remaining prep via the checkboxes.
let clicks = 0;
while ((await page.$('.pt-item:not(.done) .pt-check')) && clicks < 8) {
  await page.click('.pt-item:not(.done) .pt-check'); await page.waitForTimeout(70); clicks++;
}
console.log('all prep done -> prep-ready lanes (expect 3):', await page.$$eval('.gantt-row.prep-ready', (n) => n.length));
await page.screenshot({ path: 'tools/shot-prep.png' });

// Every timed step has an info icon; dishes finish together.
console.log('step info icons:', await page.$$eval('.gseg .seg-i', (n) => n.length));
const ends = await page.$$eval('.gantt-row', (rows) => rows.filter((r) => r.querySelector('.gseg')).map((r) => {
  const segs = [...r.querySelectorAll('.gseg')]; const last = segs[segs.length - 1];
  return Math.round((parseFloat(last.style.left) + parseFloat(last.style.width)) * 10) / 10;
}));
console.log('dish end % (all 100):', JSON.stringify(ends), '=>', ends.length === 3 && ends.every((e) => Math.abs(e - 100) < 0.5) ? 'FINISH TOGETHER ✓' : 'CHECK');

// START COOKING.
await page.click('#start-btn');
await page.waitForTimeout(400);
console.log('after start -> now-line:', !!(await page.$('.gantt-nowline')),
  '| timed bar:', (await page.$eval('.timed-now', (n) => n.textContent).catch(() => '(none)')).replace(/\s+/g, ' ').trim(),
  '| pause btn:', !!(await page.$('#pp-btn')));
const scroll2 = await page.evaluate(() => ({ s: document.body.scrollHeight, c: document.documentElement.clientHeight }));
console.log('cooking no-scroll:', scroll2.s <= scroll2.c + 1 ? 'FITS' : `SCROLLS (${scroll2.s}>${scroll2.c})`);
await page.screenshot({ path: 'tools/shot-running.png' });

// Tap a step block -> details in the header.
await page.click('.gantt-row:first-child .gseg');
await page.waitForTimeout(100);
console.log('tapped step detail:', (await page.$eval('.gantt-detail', (n) => n.textContent).catch(() => '(none)')).replace(/\s+/g, ' ').trim());

// Complete a timed task.
await page.click('#timed-done');
await page.waitForTimeout(150);
console.log('after a timed task -> done blocks:', await page.$$eval('.gseg.done', (n) => n.length));

// Persistence: prep + start survive reload.
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(300);
console.log('after reload -> prep done items:', await page.$$eval('.pt-item.done', (n) => n.length), '| cooking:', !!(await page.$('#pp-btn')));

// Editor still lists the 3 dishes with prep toggles.
await page.click('#edit-btn');
await page.waitForTimeout(200);
console.log('editor dishes:', await page.$$eval('.ed-dish', (n) => n.length), '| prep toggles:', (await page.$$eval('.ed-step-prep-cb', (n) => n.length)) > 0);
await page.click('#editor-close');

// Done state.
await page.evaluate(() => {
  const doneSteps = {}; const counts = { chicken: 4, rice: 3, veggies: 3 };
  for (const id in counts) for (let i = 0; i < counts[id]; i++) doneSteps[`${id}:${i}`] = 1000;
  localStorage.setItem('cook-with-me:run', JSON.stringify({ started: true, runningSince: Date.now() - 60000, accumMs: 0, doneSteps }));
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(200);
console.log('done state:', (await page.$eval('.timed-now.alldone', (n) => n.textContent).catch(() => '(none)')).trim());

console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console/page errors');
await browser.close();
