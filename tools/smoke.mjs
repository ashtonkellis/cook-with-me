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

// BEFORE cooking: TOP = prep to-do list (all 4 prep tasks), in COOK-START order
// (earliest-cooking dish first): chicken(0), veggies(8m), then rice(11m) x2.
const prepItems = await page.$$eval('.prep-todo .pt-item', (ns) => ns.length);
const prepOrder = await page.$$eval('.prep-todo .pt-item .pt-text b', (ns) => ns.map((n) => n.textContent.trim()));
console.log('prep to-do items before start (expect 4):', prepItems);
const prepExpect = JSON.stringify(['Prep & season chicken', 'Prep veggies', 'Measure & wash rice', 'Set up Instant Pot']);
console.log('prep order (cook-start order):', JSON.stringify(prepOrder), JSON.stringify(prepOrder) === prepExpect ? 'OK' : `EXPECTED ${prepExpect}`);

// Gantt lanes are sorted by cook-start time: veggies (starts 8m in) ABOVE rice
// (starts 11m in), because veggies starts sooner.
const laneOrder = await page.$$eval('.gantt-row .gn', (ns) => ns.map((n) => n.textContent.trim()));
const laneExpect = JSON.stringify(['BBQ chicken', 'Stir-fried veggies', 'Rice']);
console.log('gantt lane order (by start time):', JSON.stringify(laneOrder), JSON.stringify(laneOrder) === laneExpect ? 'OK ✓' : `EXPECTED ${laneExpect}`);

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
// Planning view: prep list AND timeline lanes both fully visible (no clipping).
const clip1 = await page.evaluate(() => {
  const c = (s) => { const e = document.querySelector(s); return e ? e.scrollHeight > e.clientHeight + 2 : false; };
  return { prep: c('.prep-todo'), rows: c('.gantt-rows') };
});
console.log('idle no-clip:', !clip1.prep && !clip1.rows ? 'ALL VISIBLE ✓' : `CLIPPED prep=${clip1.prep} rows=${clip1.rows}`);
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
// When all prep is done the section COLLAPSES: individual items hidden, a toggle
// appears; expanding shows them again, collapsing hides them.
console.log('prep collapsed when done: items hidden:', (await page.$$('.prep-todo .pt-item')).length === 0,
  '| toggle shown:', !!(await page.$('#prep-toggle')));
await page.click('#prep-toggle'); await page.waitForTimeout(120);
console.log('expand toggle -> items shown:', (await page.$$('.prep-todo .pt-item')).length);
await page.click('#prep-toggle'); await page.waitForTimeout(120);
console.log('collapse toggle -> items hidden:', (await page.$$('.prep-todo .pt-item')).length === 0);
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
// Total time EXCLUDES prep: only TIMED steps get Gantt blocks. BBQ chicken has
// exactly 3 timed blocks (5+8+8=21m = the meal total) starting at 0% — its 5m
// prep is NOT a block, so it doesn't inflate the timeline.
const chick = await page.$$eval('.gantt-row', (rows) => {
  const r = rows.find((x) => /BBQ chicken/.test(x.querySelector('.gn')?.textContent || ''));
  const segs = [...r.querySelectorAll('.gseg')];
  return { blocks: segs.length, firstLeft: Math.round(parseFloat(segs[0].style.left)) };
});
console.log('prep excluded from timeline: BBQ chicken timed blocks =', chick.blocks, '(expect 3), first block left =', chick.firstLeft + '%',
  chick.blocks === 3 && chick.firstLeft === 0 ? 'OK ✓' : 'CHECK');

// START COOKING.
await page.click('#start-btn');
await page.waitForTimeout(400);
console.log('after start -> now-line:', !!(await page.$('.gantt-nowline')),
  '| timed bar:', (await page.$eval('.timed-now', (n) => n.textContent).catch(() => '(none)')).replace(/\s+/g, ' ').trim(),
  '| pause btn:', !!(await page.$('#pp-btn')));
const scroll2 = await page.evaluate(() => ({ s: document.body.scrollHeight, c: document.documentElement.clientHeight }));
console.log('cooking no-scroll:', scroll2.s <= scroll2.c + 1 ? 'FITS' : `SCROLLS (${scroll2.s}>${scroll2.c})`);
const clip2 = await page.evaluate(() => {
  const c = (s) => { const e = document.querySelector(s); return e ? e.scrollHeight > e.clientHeight + 2 : false; };
  return { prep: c('.prep-todo'), rows: c('.gantt-rows') };
});
console.log('cooking no-clip:', !clip2.prep && !clip2.rows ? 'ALL VISIBLE ✓' : `CLIPPED prep=${clip2.prep} rows=${clip2.rows}`);
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
// Prep survives reload (the section is collapsed since all 4 are done, so read
// the "4/4 prep done" summary rather than the hidden rows).
console.log('after reload -> prep summary:', (await page.$eval('.hero-clock', (n) => n.textContent).catch(() => '(none)')).trim(), '| cooking:', !!(await page.$('#pp-btn')));

// Picker works MID-COOK: deselecting a dish is allowed (bug fix — it used to be
// blocked once started) and changing the selection RESETS the run (timers + prep
// checkboxes) to a clean, not-started state.
await page.click('#choose-top'); await page.waitForTimeout(150);
const onBefore = await page.$$eval('.pick-row.on', (n) => n.length);
await page.click('.pick-row:first-child'); await page.waitForTimeout(150);
const onAfter = await page.$$eval('.pick-row.on', (n) => n.length);
console.log('picker deselect while cooking:', onBefore, '->', onAfter, onAfter < onBefore ? 'WORKS ✓' : 'BLOCKED');
await page.click('#picker-done'); await page.waitForTimeout(150);
console.log('reselect resets run: cooking stopped:', !(await page.$('#pp-btn')),
  '| checkboxes cleared:', (await page.$$eval('.pt-item.done', (n) => n.length)) === 0,
  '| Start btn back:', !!(await page.$('#start-btn')));
// Restore all 3 dishes for the checks below.
await page.click('#choose-top'); await page.waitForTimeout(120);
for (const r of await page.$$('.pick-row:not(.on)')) { await r.click(); await page.waitForTimeout(60); }
await page.click('#picker-done'); await page.waitForTimeout(120);

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
