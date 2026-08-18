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
// Toggle a dish off/on to persist the meal to localStorage (for later evals).
await page.click('.pick-row:first-child'); await page.waitForTimeout(60);
await page.click('.pick-row:first-child'); await page.waitForTimeout(60);
await page.click('#picker-done');
await page.waitForTimeout(150);

// BEFORE cooking: TOP = prep to-do list (all 4 prep tasks), in Gantt/dish order.
const prepItems = await page.$$eval('.prep-todo .pt-item', (ns) => ns.length);
const prepOrder = await page.$$eval('.prep-todo .pt-item .pt-text b', (ns) => ns.map((n) => n.textContent.trim()));
console.log('prep to-do items before start (expect 4):', prepItems);
console.log('prep order (dish order — chicken, rice, rice, veggies):', JSON.stringify(prepOrder));

// BOTTOM: Start cooking button, no timed bar yet.
console.log('start-cooking button present:', !!(await page.$('#start-btn')),
  '| timed bar yet:', !!(await page.$('.timed-now.go')),
  '| gantt lanes:', await page.$$eval('.gantt-row', (n) => n.length));
// Timed steps complete by the clock now — there's no manual "Done" button.
console.log('no timed Done button (removed):', !(await page.$('#timed-done')));
// "Choose dishes" is gone from the Gantt (header icon only), and the footer
// "Load example meal" link is removed.
console.log('gantt choose-btn removed:', !(await page.$('#choose-btn')),
  '| footer load-example removed:', !(await page.$('#reset-example')),
  '| meal-done countdown:', /start now|ready in/.test(await page.$eval('.gantt-sub', (n) => n.textContent).catch(() => '')));
// Whole prep ROW is a tap target (not just the checkbox): tap the text and it toggles.
await page.click('.prep-todo .pt-item:first-child .pt-text');
await page.waitForTimeout(100);
console.log('whole prep row tappable:', await page.$eval('.prep-todo .pt-item:first-child', (n) => n.classList.contains('done')));
await page.click('.prep-todo .pt-item:first-child .pt-text');
await page.waitForTimeout(100);

const scroll1 = await page.evaluate(() => ({ s: document.body.scrollHeight, c: document.documentElement.clientHeight }));
console.log('idle no-scroll:', scroll1.s <= scroll1.c + 1 ? 'FITS' : `SCROLLS (${scroll1.s}>${scroll1.c})`);
await page.screenshot({ path: 'tools/shot-idle.png' });

// Prep can be done BEFORE cooking. Complete the first dish's prep -> its lane turns green.
await page.click('.prep-todo .pt-item:first-child .pt-check');
await page.waitForTimeout(120);
console.log('after prepping 1 dish (before cooking) -> prep-ready lanes:', await page.$$eval('.gantt-row.prep-ready', (n) => n.length),
  '| still not cooking:', !(await page.$('#pp-btn')));

// Complete all remaining prep via the checkboxes.
let clicks = 0;
while ((await page.$('.pt-item:not(.done) .pt-check')) && clicks < 8) {
  await page.click('.pt-item:not(.done) .pt-check'); await page.waitForTimeout(70); clicks++;
}
console.log('all prep done -> prep-ready lanes (expect 3):', await page.$$eval('.gantt-row.prep-ready', (n) => n.length),
  '| prep-done banner:', !!(await page.$('.prep-done-banner')));
// Calculated done time is shown.
console.log('done-time shown:', (await page.$eval('.gantt-sub', (n) => n.textContent).catch(() => '(none)')).replace(/\s+/g, ' ').trim());
// Header "choose dishes" icon opens the picker.
await page.click('#choose-top'); await page.waitForTimeout(150);
console.log('header choose-dishes opens picker:', await page.isVisible('#picker .editor-panel'));
await page.click('#picker-done'); await page.waitForTimeout(120);
await page.screenshot({ path: 'tools/shot-prep.png' });

// Every timed step has an info icon; dishes finish together.
console.log('step info icons:', await page.$$eval('.gseg .seg-i', (n) => n.length));
const ends = await page.$$eval('.gantt-row', (rows) => rows.filter((r) => r.querySelector('.gseg')).map((r) => {
  const segs = [...r.querySelectorAll('.gseg')]; const last = segs[segs.length - 1];
  return Math.round((parseFloat(last.style.left) + parseFloat(last.style.width)) * 10) / 10;
}));
console.log('dish end % (all 100):', JSON.stringify(ends), '=>', ends.length === 3 && ends.every((e) => Math.abs(e - 100) < 0.5) ? 'FINISH TOGETHER ✓' : 'CHECK');
// Total time EXCLUDES prep: longest timed-only dish is BBQ chicken (5+8+8=21m);
// prep minutes (chicken 5, rice 3+3, veggies 6) must not inflate the total.
const axisEnd = (await page.$eval('.ax-end', (n) => n.textContent).catch(() => '')).trim();
console.log('total time (prep excluded):', axisEnd, '=>', /21:00/.test(axisEnd) ? 'OK (21:00)' : 'CHECK');

// START COOKING.
await page.click('#start-btn');
await page.waitForTimeout(400);
console.log('after start -> now-line:', !!(await page.$('.gantt-nowline')),
  '| timed bar:', (await page.$eval('.timed-now', (n) => n.textContent).catch(() => '(none)')).replace(/\s+/g, ' ').trim(),
  '| pause btn:', !!(await page.$('#pp-btn')));
const scroll2 = await page.evaluate(() => ({ s: document.body.scrollHeight, c: document.documentElement.clientHeight }));
console.log('cooking no-scroll:', scroll2.s <= scroll2.c + 1 ? 'FITS' : `SCROLLS (${scroll2.s}>${scroll2.c})`);
// Countdown to the next step + rewind/ff buttons.
console.log('next-step countdown:', (await page.$eval('.timed-next', (n) => n.textContent).catch(() => '(none)')).replace(/\s+/g, ' ').trim(),
  '| rewind+ff btns:', !!(await page.$('#rew-btn')) && !!(await page.$('#ff-btn')));
// Fast-forward 15s advances the now-line.
const before = await page.$eval('.now-flag', (n) => n.textContent).catch(() => '?');
await page.click('#ff-btn'); await page.waitForTimeout(120);
const after = await page.$eval('.now-flag', (n) => n.textContent).catch(() => '?');
console.log('fast-forward 15s:', before, '->', after);
await page.screenshot({ path: 'tools/shot-running.png' });

// Tap a step block -> larger detail panel (label, timing, note) + close button.
await page.click('.gantt-row:first-child .gseg');
await page.waitForTimeout(120);
console.log('tapped step detail panel:', !!(await page.$('.step-detail')),
  '| label:', (await page.$eval('.step-detail .sd-label', (n) => n.textContent).catch(() => '(none)')).trim(),
  '| has close:', !!(await page.$('#detail-close')));
await page.click('#detail-close'); await page.waitForTimeout(100);
console.log('detail panel closes:', !(await page.$('.step-detail')));

// Timed steps auto-complete by the wall clock (no Done button). Jump the clock
// ~6 min in and confirm the first timed step's block flips to done on its own.
await page.evaluate(() => {
  const run = JSON.parse(localStorage.getItem('cook-with-me:run'));
  run.runningSince = null; run.accumMs = 6 * 60 * 1000;   // 6 min in, paused
  localStorage.setItem('cook-with-me:run', JSON.stringify(run));
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(250);
console.log('timed step auto-done by clock:', await page.$$eval('.gseg.done', (n) => n.length), '(>=1 expected)',
  '| still no Done button:', !(await page.$('#timed-done')));

// Persistence: prep + start survive reload.
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(300);
console.log('after reload -> prep done items:', await page.$$eval('.pt-item.done', (n) => n.length), '| cooking:', !!(await page.$('#pp-btn')));

// Editing is fully removed — no gear button, no editor modal, no picker "Edit".
console.log('editor removed:', !(await page.$('#edit-btn')) && !(await page.$('#editor')),
  '| picker edit removed:', !(await page.$('#picker-edit')));

// The meal is code-sourced: a stale saved meal in localStorage is ignored/purged.
await page.evaluate(() => {
  localStorage.setItem('cook-with-me:meal', JSON.stringify({ dishes: [{ id: 'ghost', name: 'Stale test dish', emoji: '👻', included: true, steps: [{ label: 'x', minutes: 5 }] }] }));
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(200);
console.log('stale saved meal purged:', await page.evaluate(() => localStorage.getItem('cook-with-me:meal') === null),
  '| no ghost dish in gantt:', !(await page.$$eval('.gantt-label .gn', (ns) => ns.some((n) => /stale test/i.test(n.textContent)))));

// Single included dish: prep done + clock past its timeline -> finishes on its own.
await page.evaluate(() => {
  localStorage.setItem('cook-with-me:included', JSON.stringify({ chicken: false, rice: true, veggies: false }));
  localStorage.setItem('cook-with-me:run', JSON.stringify({ started: true, runningSince: null, accumMs: 30 * 60 * 1000, doneSteps: { 'rice:0': 1000, 'rice:1': 1000 } }));
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(200);
console.log('single dish auto-completes by clock:', (await page.$eval('.timed-now.alldone', (n) => n.textContent).catch(() => '(none)')).trim());

// Done state: all dishes, every prep ticked off + clock past the whole timeline.
await page.evaluate(() => {
  localStorage.setItem('cook-with-me:included', JSON.stringify({ chicken: true, rice: true, veggies: true }));
  // seed prep steps: chicken:0, rice:0, rice:1, veggies:0
  const doneSteps = { 'chicken:0': 1000, 'rice:0': 1000, 'rice:1': 1000, 'veggies:0': 1000 };
  localStorage.setItem('cook-with-me:run', JSON.stringify({ started: true, runningSince: null, accumMs: 60 * 60 * 1000, doneSteps }));
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(200);
console.log('done state:', (await page.$eval('.timed-now.alldone', (n) => n.textContent).catch(() => '(none)')).trim());

console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console/page errors');
await browser.close();
