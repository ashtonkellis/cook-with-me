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

// No-prep dish -> marked prep-ready. Give rice an all-timed set of steps.
await page.evaluate(() => {
  const m = JSON.parse(localStorage.getItem('cook-with-me:meal'));
  const rice = m.dishes.find((d) => d.id === 'rice');
  rice.steps.forEach((s) => { delete s.prep; });
  for (const d of m.dishes) d.included = (d.id === 'rice');
  localStorage.setItem('cook-with-me:meal', JSON.stringify(m));
  localStorage.setItem('cook-with-me:run', JSON.stringify({ started: false, runningSince: null, accumMs: 0, doneSteps: {} }));
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(200);
await page.click('#picker-done').catch(() => {});
await page.waitForTimeout(120);
console.log('no-prep dish prep-ready:', await page.$$eval('.gantt-row.prep-ready', (n) => n.length), '(expect 1, rice)');

// Jump-ahead: single dish, start, complete first timed step early -> clock jumps.
await page.click('#start-btn'); await page.waitForTimeout(300);
const flagBefore = await page.$eval('.now-flag', (n) => n.textContent).catch(() => '?');
await page.click('#timed-done'); await page.waitForTimeout(200);
const flagAfter = await page.$eval('.now-flag', (n) => n.textContent).catch(() => '?');
console.log('jump-ahead (1 dish) clock:', flagBefore, '->', flagAfter, '(should jump forward)');

// Reset the default meal for a clean state.
await page.evaluate(() => {
  const m = JSON.parse(localStorage.getItem('cook-with-me:meal'));
  const rice = m.dishes.find((d) => d.id === 'rice');
  rice.steps[0].prep = true; rice.steps[1].prep = true;
  for (const d of m.dishes) d.included = true;
  localStorage.setItem('cook-with-me:meal', JSON.stringify(m));
});

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
