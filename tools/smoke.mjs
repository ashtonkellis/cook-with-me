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
const lanes = await page.$$eval('.gantt-row', (n) => n.length);
console.log('gantt lanes (expect 3):', lanes);

// No page scroll — the whole app fits the viewport.
const scroll = await page.evaluate(() => ({
  scrollH: document.body.scrollHeight, client: document.documentElement.clientHeight,
  overflowY: getComputedStyle(document.body).overflowY,
}));
console.log('no-scroll check:', JSON.stringify(scroll), '=>', scroll.scrollH <= scroll.client + 1 ? 'FITS' : 'SCROLLS');

// CONFIRM synchronized finish: every dish's last step must end at 100% of the
// meal timeline (right edge). Read each lane's last block's left+width.
const ends = await page.$$eval('.gantt-row', (rows) => rows.map((r) => {
  const segs = [...r.querySelectorAll('.gseg')];
  const last = segs[segs.length - 1];
  const left = parseFloat(last.style.left), width = parseFloat(last.style.width);
  return Math.round((left + width) * 10) / 10;
}));
console.log('dish end % (all must be 100):', JSON.stringify(ends),
  '=>', ends.every((e) => Math.abs(e - 100) < 0.5) ? 'ALL FINISH TOGETHER ✓' : 'MISALIGNED ✗');

await page.screenshot({ path: 'tools/shot-idle.png' });

// Start the meal
await page.click('#start-btn');
await page.waitForTimeout(600);
const nextStep = await page.textContent('.next-step');
console.log('next-step block:', nextStep.replace(/\s+/g, ' ').trim());
const statuses = await page.$$eval('.gantt-label .gs', (ns) => ns.map((n) => n.textContent));
console.log('lane statuses after start:', statuses);
const nowline = await page.$('.gantt-nowline');
console.log('now-line present:', !!nowline);
const heroNote = await page.$eval('.next-step .ns-note', (n) => n.textContent).catch(() => '(none)');
console.log('hero next-step note:', heroNote.trim());

// Tap a Gantt block -> its note shows in the detail line
await page.click('.gantt-row:first-child .gseg:first-child');
await page.waitForTimeout(150);
const detail = await page.$eval('.gantt-detail', (n) => n.textContent).catch(() => '(none)');
console.log('tapped-block detail:', detail.trim());
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
const doneStatuses = await page.$$eval('.gantt-label .gs', (ns) => ns.map((n) => n.textContent));
console.log('done hero (expect Ready):', doneHero.trim(), '| lane statuses:', doneStatuses);

console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console/page errors');
await browser.close();
