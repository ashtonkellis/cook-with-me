// Cook With Me — master meal timer
// One Start button launches a whole meal. Each dish's steps are sequenced so
// every dish finishes at the same moment. Timers are derived from an absolute
// start timestamp (wall clock), so closing/reopening never resets progress.

// ---------- Meal definition ----------
// The meal lives HERE in code — there is no in-app editor. Edit dishes/steps by
// pushing changes to this file. `included` is the only per-dish state the app
// persists (which dishes are in tonight's meal, chosen in the picker); the dish
// content itself always comes from this seed.
const EXAMPLE_MEAL = {
  name: 'BBQ dinner',
  dishes: [
    {
      id: 'chicken', name: 'BBQ chicken thighs', emoji: '🍗', included: true,
      steps: [
        { label: 'Prep & season chicken', minutes: 5, prep: true, note: 'Pat dry, salt + rub, bring to room temp.' },
        { label: 'Preheat BBQ', minutes: 5, shared: true, note: 'Medium-high, ~450°F. Oil the grates.' },
        { label: 'Cook side 1', minutes: 8, note: 'Skin-side down. Don’t move them — let the skin crisp.' },
        { label: 'Cook side 2', minutes: 8, note: 'Flip once. Pull at 175°F internal.' },
      ],
    },
    {
      id: 'chicken-breast', name: 'BBQ chicken breast', emoji: '🍗', included: false,
      steps: [
        { label: 'Prep & season chicken', minutes: 5, prep: true, note: 'Pat dry, salt + rub, bring to room temp.' },
        { label: 'Preheat BBQ', minutes: 5, shared: true, note: 'Medium-high, ~450°F. Oil the grates.' },
        { label: 'Cook side 1', minutes: 9, note: 'Skin-side down. Don’t move them — let the skin crisp.' },
        { label: 'Cook side 2', minutes: 9, note: 'Flip once. Pull at 175°F internal.' },
      ],
    },
    {
      id: 'rice', name: 'Rice', emoji: '🍚', included: true,
      steps: [
        { label: 'Measure & wash rice', minutes: 3, prep: true, note: '2 cups rice, rinse until water runs clear.' },
        { label: 'Set up Instant Pot', minutes: 3, prep: true, note: 'Add rinsed rice + 1:1 water. Seal, valve to Sealing.' },
        { label: 'Cook rice', minutes: 10, note: 'Instant Pot: Manual / Pressure Cook, 3 min, then natural release.' },
      ],
    },
    {
      id: 'veggies', name: 'Stir-fried veggies', emoji: '🥦', included: true,
      steps: [
        { label: 'Prep veggies', minutes: 6, prep: true, note: 'Broccoli, peppers, snap peas — bite-size, uniform. Chop any time ahead.' },
        { label: 'Preheat pan', minutes: 3, note: 'Wok or skillet, high heat, 1 tbsp oil until shimmering.' },
        { label: 'Cook veggies', minutes: 10, note: 'Toss constantly. Add garlic + soy at the end.' },
      ],
    },
  ],
};

const SEL_KEY = 'cook-with-me:included'; // per-dish included flags: { id: bool }
const RUN_KEY = 'cook-with-me:run';
// Legacy keys from when the whole meal (and a since-removed in-app editor) were
// persisted. The meal is now code-sourced, so purge them on load.
const LEGACY_KEYS = ['cook-with-me:meal', 'cook-with-me:migrated'];

// ---------- State ----------
let meal = null;              // { name, dishes: [{id,name,emoji,steps:[{label,minutes}]}] }
let schedule = null;          // derived; see computeSchedule()
// run: absolute-timestamp model so wall clock drives everything.
//   started:  has the meal begun at all
//   runningSince: ms timestamp of last resume (null when paused)
//   accumMs:  accumulated running time before the current resume
// run: wall-clock elapsed (runningSince + accumMs) plus doneSteps, a map of
// stepKey -> completion time (meal-elapsed ms). Persisted so progress survives.
let run = { started: false, runningSince: null, accumMs: 0, doneSteps: {} };
let lastActiveKeys = new Set(); // step keys currently available (for new-task chimes)
let mealDoneNotified = false;
let tickHandle = null;
let selected = null;          // { di, si } — Gantt block tapped to inspect its note
let prepExpanded = false;     // when all prep is done, show the collapsed list?

// ---------- Elements ----------
const el = {
  hero: document.getElementById('hero'),
  gantt: document.getElementById('gantt'),
  chooseTop: document.getElementById('choose-top'),
  picker: document.getElementById('picker'),
  pickerList: document.getElementById('picker-list'),
  pickerClose: document.getElementById('picker-close'),
  pickerDone: document.getElementById('picker-done'),
};

// ---------- Helpers ----------
const MIN = 60 * 1000;

function fmtDur(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}
function fmtClock(ms) {
  return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
// Compact duration for totals: seconds when under ~90s, else whole minutes.
function fmtLen(ms) {
  return ms < 90 * 1000 ? `${Math.round(ms / 1000)}s` : `${Math.round(ms / MIN)}m`;
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// A step is a "prep" task if flagged prep (legacy `ahead` also counts). Prep
// tasks are untimed — they don't occupy the finish-together timeline.
const isPrep = (st) => !!(st.prep || st.ahead);

// ---------- Scheduling ----------
// Only TIMED steps are scheduled: each included dish's timed steps run back-to-
// back and end at mealMs, so all dishes finish together. Prep steps carry a
// duration (for display) but no timeline position.
function computeSchedule(m) {
  const dishes = m.dishes.map((d) => {
    const timedDur = d.steps.reduce((s, st) => s + (isPrep(st) ? 0 : st.minutes), 0) * MIN;
    return { ...d, included: d.included !== false, durationMs: timedDur };
  });
  const included = dishes.filter((d) => d.included);
  const mealMs = Math.max(0, ...included.map((d) => d.durationMs));
  for (const d of dishes) {
    if (d.included) {
      d.startMs = mealMs - d.durationMs; // where this dish's timed steps begin
      let cursor = d.startMs;
      d.steps = d.steps.map((st) => {
        const len = st.minutes * MIN;
        if (isPrep(st)) return { ...st, prep: true, lenMs: len, startMs: null, endMs: null };
        const start = cursor;
        cursor += len;
        return { ...st, prep: false, lenMs: len, startMs: start, endMs: cursor };
      });
      d.endMs = mealMs;
    } else {
      d.startMs = null;
      d.endMs = null;
      d.steps = d.steps.map((st) => ({ ...st, prep: isPrep(st), lenMs: st.minutes * MIN, startMs: null, endMs: null }));
    }
  }
  return { dishes, mealMs, includedCount: included.length };
}

// Toggle a dish in/out of the meal. Changing the selection defines a different
// meal, so it always resets the run — timers AND prep checkboxes — to a clean
// state (this also means the picker works even mid-cook, not just before start).
function toggleDish(id) {
  const d = meal.dishes.find((x) => x.id === id);
  if (!d) return;
  d.included = !(d.included !== false);
  saveSelection();
  schedule = computeSchedule(meal);
  resetMeal(); // clears run (timers) + doneSteps (checkboxes), stops the clock, re-renders
}

// Flat, time-ordered list of every step-start across all dishes.
function allStepStarts() {
  const out = [];
  for (const d of schedule.dishes) {
    if (!d.included) continue;
    for (const st of d.steps) out.push({ dish: d, step: st, at: st.startMs });
  }
  out.sort((a, b) => a.at - b.at);
  return out;
}

// ---------- Run clock ----------
// Elapsed time in the meal (wall-clock based, pause-aware). Timed steps
// complete as the clock passes their scheduled end.
function elapsedMs() {
  if (!run.started) return 0;
  const live = run.runningSince != null ? Date.now() - run.runningSince : 0;
  return run.accumMs + live;
}
const isRunning = () => run.started && run.runningSince != null;
const stepKey = (dishId, si) => `${dishId}:${si}`;

// Whole meal complete? Timed steps finish by the clock, prep is ticked off
// manually — computeProgress folds both into `allDone`.
function isAllDone() {
  if (!run.started) return false;
  return computeProgress().allDone;
}

// Shared steps: steps flagged `shared` with the same label across included
// dishes are one physical task. The dish that needs it earliest "owns" it (you
// do it there); the other copies are redundant and auto-satisfied when the
// owner is done. Returns a map: stepKey -> { groupKey, isOwner, ownerKey, count }.
function sharedInfo() {
  const groups = {};
  for (const d of schedule.dishes) {
    if (!d.included) continue;
    d.steps.forEach((s, si) => {
      if (!s.shared) return;
      const gk = s.label.trim().toLowerCase();
      (groups[gk] || (groups[gk] = [])).push({ key: stepKey(d.id, si), start: s.startMs });
    });
  }
  const info = {};
  for (const gk in groups) {
    const arr = groups[gk].slice().sort((a, b) => a.start - b.start);
    const owner = arr[0];
    for (const e of arr) info[e.key] = { groupKey: gk, isOwner: e.key === owner.key, ownerKey: owner.key, count: arr.length };
  }
  return info;
}

// Live progression, split into two tracks:
//   • prep  — untimed do-any-time tasks (top to-do list), pending in order
//   • timed — scheduled steps projected onto the Gantt (bottom)
function computeProgress() {
  const elapsed = elapsedMs();
  const done = run.doneSteps || {};   // prep completions only (manual checkoffs)
  const shared = sharedInfo();
  let timelineMs = schedule.mealMs;

  // Pass A — project every step onto the shared timeline. Timed steps are
  // scheduled (start = cursor / dish start, end = start + length); prep steps
  // are untimed. Record each timed step's projected end so a shared step's
  // "owner done" can be judged by the wall clock in pass B.
  const endByKey = {};
  const projByDish = [];
  for (let di = 0; di < schedule.dishes.length; di++) {
    const d = schedule.dishes[di];
    if (!d.included) { projByDish.push(null); continue; }
    let cursor = 0;
    const rows = d.steps.map((s, si) => {
      const key = stepKey(d.id, si);
      const sh = shared[key];
      const redundant = !!(sh && !sh.isOwner);
      const shareCount = sh ? sh.count : 0;
      const ownerKey = sh ? sh.ownerKey : null;
      if (s.prep) return { si, key, prep: true, redundant, shareCount, ownerKey };
      const projStart = Math.max(cursor, s.startMs || 0);
      const projEnd = projStart + s.lenMs;
      cursor = projEnd;
      endByKey[key] = projEnd;
      return { si, key, prep: false, redundant, shareCount, ownerKey, projStart, projEnd };
    });
    timelineMs = Math.max(timelineMs, cursor);
    projByDish.push(rows);
  }

  // Pass B — derive each step's state. TIMED steps complete automatically as the
  // wall clock passes their scheduled end; PREP steps stay manual (ticked off in
  // the top to-do list, any time — even before cooking starts).
  const dishes = [];
  const timedActions = [];
  const prepPending = [];
  const prepAll = [];
  let timedTotal = 0, timedDone = 0, prepTotal = 0, prepDone = 0;

  for (let di = 0; di < schedule.dishes.length; di++) {
    const d = schedule.dishes[di];
    const rows = projByDish[di];
    if (!d.included || !rows) { dishes.push({ ...d, di }); continue; }
    const steps = rows.map((r) => {
      const s = d.steps[r.si];
      const { si, key, redundant, shareCount, ownerKey } = r;
      const ownerDonePrep = ownerKey ? ownerKey in done : false;
      const ownerDoneClock = ownerKey ? elapsed >= (endByKey[ownerKey] ?? Infinity) : false;

      if (r.prep) {
        const finished = key in done || (redundant && ownerDonePrep);
        if (!redundant) { prepTotal++; if (finished) prepDone++; }
        const state = finished ? 'done' : (redundant ? (ownerDonePrep ? 'shared-done' : 'shared') : 'pending');
        const entry = { di, si, key, dish: d, step: { ...s, si, key, shareCount }, done: finished };
        if (!redundant) prepAll.push(entry);
        if (!redundant && !finished) prepPending.push(entry);
        return { ...s, si, key, state, redundant, shareCount };
      }

      // timed step — state driven by the wall clock
      let state;
      if (redundant) {
        state = ownerDoneClock ? 'shared-done' : 'shared';
      } else {
        timedTotal++;
        if (elapsed >= r.projEnd) { state = 'done'; timedDone++; }
        else if (run.started && elapsed >= r.projStart - 1) {
          state = 'active';
          timedActions.push({ di, si, dish: d, step: { ...s, si, key, projStart: r.projStart, projEnd: r.projEnd, shareCount } });
        } else {
          state = 'waiting';
        }
      }
      return { ...s, si, key, projStart: r.projStart, projEnd: r.projEnd, state, redundant, shareCount };
    });
    dishes.push({ ...d, di, steps });
  }

  timedActions.sort((a, b) => a.step.projStart - b.step.projStart);
  // Prep tasks (and Gantt lanes) are ordered by when their dish's timed cooking
  // begins — the dish that starts cooking soonest comes first. Ties fall back to
  // meal-definition order, then step order.
  const dishStart = (x) => (x.dish && x.dish.startMs != null) ? x.dish.startMs : Infinity;
  const byCookOrder = (a, b) => (dishStart(a) - dishStart(b)) || (a.di - b.di) || (a.si - b.si);
  prepPending.sort(byCookOrder);
  prepAll.sort(byCookOrder);
  const totalSteps = prepTotal + timedTotal;
  const doneCount = prepDone + timedDone;
  return {
    elapsed, dishes, timedActions, prepPending, prepAll, timelineMs,
    prepTotal, prepDone, timedTotal, timedDone, totalSteps, doneCount,
    allDone: totalSteps > 0 && doneCount === totalSteps,
  };
}

// Set the elapsed clock to a target (ms), keeping pause state consistent.
function setElapsed(targetMs) {
  const target = Math.max(0, targetMs);
  if (run.runningSince != null) run.accumMs = target - (Date.now() - run.runningSince);
  else run.accumMs = target;
}
// Rewind / fast-forward the timed clock by a delta (ms).
function nudgeClock(deltaMs) {
  if (!run.started) return;
  setElapsed(elapsedMs() + deltaMs);
  if ('vibrate' in navigator) navigator.vibrate(15);
  saveRun();
  refresh();
}
// Toggle completion (used by prep checkboxes). Prep can be done ANY time — even
// before "Start cooking" — so this doesn't require the timed clock to be running.
function toggleStepDone(dishId, si) {
  if (!schedule.includedCount) return;
  run.doneSteps = run.doneSteps || {};
  const k = stepKey(dishId, si);
  if (k in run.doneSteps) delete run.doneSteps[k];
  else run.doneSteps[k] = elapsedMs();
  if ('vibrate' in navigator) navigator.vibrate(20);
  saveRun();
  refresh();
}

// "Start cooking" begins the TIMED clock. Prep already ticked off is preserved.
function startMeal() {
  if (!schedule.includedCount) return; // nothing selected
  primeAudio();
  requestNotifyPermission();
  run.started = true;
  run.runningSince = Date.now();
  run.accumMs = 0;
  run.doneSteps = run.doneSteps || {};
  lastActiveKeys = new Set();
  mealDoneNotified = false;
  saveRun();
  startTicking();
  refresh();
}
function pauseMeal() {
  if (!isRunning()) return;
  run.accumMs += Date.now() - run.runningSince;
  run.runningSince = null;
  saveRun();
  stopTicking();
  refresh();
}
function resumeMeal() {
  if (!run.started || isRunning() || isAllDone()) return;
  run.runningSince = Date.now();
  saveRun();
  startTicking();
  refresh();
}
function resetMeal() {
  run = { started: false, runningSince: null, accumMs: 0, doneSteps: {} };
  lastActiveKeys = new Set();
  mealDoneNotified = false;
  selected = null;
  saveRun();
  stopTicking();
  refresh();
}

function startTicking() {
  stopTicking();
  tickHandle = setInterval(refresh, 250);
}
function stopTicking() {
  if (tickHandle) { clearInterval(tickHandle); tickHandle = null; }
}

// Single update path: recompute progress, fire alerts for newly-available
// tasks / completion, render, and stop the clock when everything's done.
function progActionKeys(prog) {
  return [...prog.timedActions.map((a) => a.step.key), ...prog.prepPending.map((p) => p.key)];
}
function refresh() {
  const prog = computeProgress();

  if (run.started && isRunning()) {
    for (const a of prog.timedActions) {
      if (!lastActiveKeys.has(a.step.key)) notify(`${a.dish.emoji} ${a.step.label}`, a.dish.name);
    }
  }
  lastActiveKeys = new Set(progActionKeys(prog));

  if (prog.allDone && !mealDoneNotified) {
    mealDoneNotified = true;
    notify('🍽️ Meal ready!', 'Everything is done — plate up.');
  }

  renderHero(prog);
  renderGantt(prog);

  if (prog.allDone && tickHandle) { stopTicking(); saveRun(); }
  return prog;
}
const render = refresh;

// ---------- Persistence ----------
// Only the per-dish `included` selection is saved (the dish content is code-
// sourced from EXAMPLE_MEAL). Stored as { id: bool }, so dishes added to the
// seed later default to their own `included` value rather than being hidden.
function saveSelection() {
  try {
    const sel = {};
    for (const d of meal.dishes) sel[d.id] = d.included !== false;
    localStorage.setItem(SEL_KEY, JSON.stringify(sel));
  } catch (_) {}
}
function saveRun() {
  try { localStorage.setItem(RUN_KEY, JSON.stringify(run)); } catch (_) {}
}
// The meal always comes from the code-defined seed; any stale saved meal (which
// may hold old test dishes) is discarded. Apply the saved include/exclude
// selection on top, keeping each dish's seed default when it isn't in the map.
function loadMeal() {
  try { for (const k of LEGACY_KEYS) localStorage.removeItem(k); } catch (_) {}
  const m = JSON.parse(JSON.stringify(EXAMPLE_MEAL));
  try {
    const raw = localStorage.getItem(SEL_KEY);
    if (raw) {
      const sel = JSON.parse(raw);
      if (sel && typeof sel === 'object') {
        for (const d of m.dishes) if (d.id in sel) d.included = !!sel[d.id];
      }
    }
  } catch (_) {}
  return m;
}
function loadRun() {
  try {
    const raw = localStorage.getItem(RUN_KEY);
    if (raw) {
      const r = JSON.parse(raw);
      if (r && typeof r.started === 'boolean') { r.doneSteps = r.doneSteps || {}; return r; }
    }
  } catch (_) {}
  return { started: false, runningSince: null, accumMs: 0, doneSteps: {} };
}

// ---------- Rendering ----------
// TOP card = PREP to-do list only (untimed tasks, doable any time — even before
// "Start cooking"). Cooking controls + timeline live in the BOTTOM (Gantt) card.
function renderHero(prog) {
  if (!schedule.includedCount) {
    el.hero.innerHTML = `
      <div class="hero-top"><span class="hero-label">🔪 Prep</span></div>
      <div class="prep-empty">No dishes chosen yet — pick some below.</div>`;
    return;
  }

  const prepAll = prog.prepAll || [];
  if (!prepAll.length) {
    el.hero.innerHTML = `
      <div class="hero-top"><span class="hero-label">🔪 Prep</span><span class="hero-clock">No prep needed</span></div>
      <div class="prep-empty">No prep tasks — start cooking below ↓</div>`;
    return;
  }

  // Completing a prep task REMOVES it from the visible list — only pending tasks
  // show (full detail: dish, duration, note). Completed tasks are tucked behind a
  // "Show N completed" toggle. This keeps the list shrinking as you work, freeing
  // the timeline room.
  const currentKey = prog.prepPending[0] ? prog.prepPending[0].key : null;
  const renderItem = (p, compact) => {
    const s = p.step;
    const isCur = !compact && p.key === currentKey;
    const len = fmtLen(s.lenMs || (s.minutes * MIN));
    const noteLine = (!compact && s.note) ? `<span class="pt-note">📝 ${escapeHtml(s.note)}</span>` : '';
    return `
      <li class="pt-item${p.done ? ' done' : ''}${isCur ? ' current' : ''}">
        <button class="pt-check" data-id="${escapeHtml(p.dish.id)}" data-si="${p.si}" aria-label="${p.done ? 'Undo' : 'Complete'} ${escapeHtml(s.label)}">${p.done ? '✓' : ''}</button>
        <span class="pt-emoji">${escapeHtml(p.dish.emoji)}</span>
        <span class="pt-text">
          <b>${escapeHtml(s.label)}${s.shareCount > 1 ? ` <span class="ahead-tag shared-tag">shared ×${s.shareCount}</span>` : ''}</b>
          <small>${escapeHtml(p.dish.name)} · ${len}</small>
          ${noteLine}
        </span>
      </li>`;
  };

  const pending = prepAll.filter((p) => !p.done);
  const completed = prepAll.filter((p) => p.done);
  const allPrepDone = prog.prepTotal > 0 && prog.prepDone === prog.prepTotal;

  const banner = allPrepDone
    ? `<div class="prep-done-banner">✅ All prep done — ready to cook!${run.started ? '' : ' Tap ▶ Start cooking below.'}</div>`
    : '';
  const pendingList = pending.length
    ? `<ul class="prep-todo">${pending.map((p) => renderItem(p, false)).join('')}</ul>`
    : '';
  const c = completed.length;
  const toggle = c
    ? `<button class="prep-toggle" id="prep-toggle" aria-expanded="${prepExpanded}">${prepExpanded ? '▾ Hide completed' : `▸ Show ${c} completed`}</button>`
    : '';
  const completedList = (prepExpanded && c)
    ? `<ul class="prep-todo compact done-list">${completed.map((p) => renderItem(p, true)).join('')}</ul>`
    : '';
  el.hero.innerHTML = `
    <div class="hero-top">
      <span class="hero-label">🔪 Prep — do any time</span>
      <span class="hero-clock">${prog.prepDone}/${prog.prepTotal} prep done</span>
    </div>
    ${banner}
    ${pendingList}
    ${toggle}
    ${completedList}`;
}

// Distinct hue per dish; steps within a dish graduate in lightness so each
// block is its own shade — dish = hue, step = shade (easy to grok).
const DISH_HUES = [38, 199, 152, 344, 264, 24, 96, 320];
function dishHue(i) { return DISH_HUES[i % DISH_HUES.length]; }
function stepColor(hue, idx, total) {
  const l = total <= 1 ? 58 : 48 + Math.round((idx / (total - 1)) * 26); // 48%..74%
  return `hsl(${hue} 80% ${l}%)`;
}

// Status pill text + class for a projected step (used in the step-detail panel).
const STEP_STATUS = {
  active: { label: 'Cooking now', cls: 'active' },
  waiting: { label: 'Up next', cls: 'waiting' },
  done: { label: 'Done ✓', cls: 'done' },
  shared: { label: 'Shared', cls: 'shared' },
  'shared-done': { label: 'Shared ✓', cls: 'done' },
  pending: { label: 'Prep · do any time', cls: 'prep' },
};

// Rich detail panel for the Gantt step tapped by the user (`selected`).
function stepDetail(dish, step, elapsed) {
  const isPrepStep = !!step.prep;
  const st = STEP_STATUS[step.state] || { label: '', cls: '' };
  const statusLabel = isPrepStep && step.state === 'done' ? 'Done ✓' : st.label;
  const len = fmtLen(step.lenMs || (step.minutes * MIN));
  let timing;
  if (isPrepStep) {
    timing = `<span class="sd-when">🔪 Prep — do any time · ${len}</span>`;
  } else {
    const base = run.started ? Date.now() - elapsed : Date.now();
    const startC = fmtClock(base + step.projStart);
    const endC = fmtClock(base + step.projEnd);
    timing = `<span class="sd-when">🕐 ${startC} – ${endC}${run.started ? '' : ' (if you start now)'} · ${len}</span>`;
  }
  const note = step.note
    ? `<p class="sd-note">📝 ${escapeHtml(step.note)}</p>`
    : `<p class="sd-note sd-note-empty">No note for this step.</p>`;
  return `
    <div class="step-detail">
      <div class="sd-head">
        <span class="sd-emoji">${escapeHtml(dish.emoji)}</span>
        <div class="sd-titles">
          <span class="sd-label">${escapeHtml(step.label)}</span>
          <span class="sd-dish">${escapeHtml(dish.name)}</span>
        </div>
        <span class="sd-status ${st.cls}">${statusLabel}</span>
      </div>
      ${timing}
      ${note}
      <button class="sd-close" id="detail-close" aria-label="Close details">✕ Close</button>
    </div>`;
}

function renderGantt(prog) {
  const elapsed = prog.elapsed;
  const scaleMs = (run.started ? prog.timelineMs : schedule.mealMs) || 1;
  const pct = (ms) => Math.max(0, Math.min(100, (ms / scaleMs) * 100));
  const nowPct = pct(elapsed);

  const picking = !run.started;
  // Lanes are sorted by when each dish starts cooking (earliest on top), so the
  // timeline reads as a natural top-to-bottom cascade. `di` stays the dish's real
  // index (used for color + selection); we only reorder the rendered rows.
  const laneOrder = (a, b) => {
    const ai = a.included !== false, bi = b.included !== false;
    if (ai !== bi) return ai ? -1 : 1;
    const as = a.startMs == null ? Infinity : a.startMs;
    const bs = b.startMs == null ? Infinity : b.startMs;
    return (as - bs) || (a.di - b.di);
  };
  const rows = [...prog.dishes].sort(laneOrder).map((d) => {
    const di = d.di;
    if (!d.included) return '';
    const hue = dishHue(di);
    const excluded = false;

    const timedSteps = d.steps.filter((s) => !s.prep);

    // Per-dish prep status badge (prep tasks live up top; show here whether this
    // dish's prep is all done).
    const prepSteps = d.steps.filter((s) => s.prep && !s.redundant);
    const prepDoneN = prepSteps.filter((s) => s.state === 'done' || s.state === 'shared-done').length;
    // A dish is "prep ready" when all its prep is done — including dishes that
    // have NO prep steps at all (nothing to prep → ready to cook).
    const prepReady = prepDoneN === prepSteps.length;
    let prepBadge;
    if (prepReady) prepBadge = `<span class="lane-prep done">${prepSteps.length ? '✓ Prep done' : '✓ No prep'}</span>`;
    else if (prepDoneN > 0) prepBadge = `<span class="lane-prep pending">🔪 ${prepSteps.length - prepDoneN} prep left</span>`;
    else prepBadge = `<span class="lane-prep">🔪 ${prepSteps.length} prep</span>`;

    // Per-dish status shown in the label gutter (timed steps only).
    let status, statusCls;
    if (!run.started) {
      status = fmtLen(d.durationMs); statusCls = '';
    } else if (!timedSteps.length) {
      status = 'Prep only'; statusCls = '';
    } else {
      const active = timedSteps.find((s) => s.state === 'active');
      const waiting = timedSteps.find((s) => s.state === 'waiting');
      if (timedSteps.every((s) => s.state === 'done' || s.state === 'shared-done')) { status = '✓ Done'; statusCls = 'done'; }
      else if (active) { const r = active.projEnd - elapsed; status = r <= 0 ? 'Go now' : `${fmtDur(r)} left`; statusCls = 'cook'; }
      else if (waiting) { status = `In ${fmtDur(Math.max(0, waiting.projStart - elapsed))}`; statusCls = 'wait'; }
      else { status = ''; statusCls = ''; }
    }

    // Only TIMED steps get blocks on the timeline; prep steps live up top.
    const segs = d.steps.map((s, si) => {
      if (s.prep) return '';
      const left = pct(s.projStart), width = Math.max(0.8, pct(s.projEnd) - pct(s.projStart));
      const isSel = selected && selected.di === di && selected.si === si;
      const wideEnough = width >= 9;
      const done = run.started && s.state === 'done';
      const isShared = run.started && (s.state === 'shared' || s.state === 'shared-done');
      const cls = `gseg${run.started ? ' ' + s.state : ''}${isSel ? ' sel' : ''}`;
      const prefix = done ? '✓ ' : (s.state === 'shared-done' ? '✓ ' : (s.state === 'shared' ? '↔ ' : ''));
      const label = isShared ? `${prefix}shared` : `${prefix}${escapeHtml(s.label)}`;
      const tip = isShared ? `${escapeHtml(s.label)} — shared, done once by another dish` : `${escapeHtml(s.label)} · ${fmtLen(s.lenMs)}${s.note ? ' — ' + escapeHtml(s.note) : ''}`;
      // Every step carries a small info dot; tapping the block shows its details.
      const info = `<span class="seg-i" aria-hidden="true">ⓘ</span>`;
      const inner = wideEnough ? `<span class="seg-label">${label}</span>${info}` : info;
      return `<div class="${cls}" data-di="${di}" data-si="${si}" style="left:${left}%;width:${width}%;background:${stepColor(hue, si, d.steps.length)}" title="${tip}">${inner}</div>`;
    }).join('');

    const geCls = `ge${prepReady ? ' prep-ready' : ' prep-pending'}`;
    return `
      <div class="gantt-row${prepReady ? ' prep-ready' : ''}">
        <div class="gantt-label">
          <span class="${geCls}">${escapeHtml(d.emoji)}</span>
          <span class="gtxt"><span class="gn">${escapeHtml(d.name)}</span><span class="gs ${statusCls}">${status}</span>${prepBadge}</span>
        </div>
        <div class="gantt-track" style="--hue:${hue}">${segs}</div>
      </div>`;
  }).join('');

  const nowLayer = run.started
    ? `<div class="gantt-now-layer">
         <div class="gantt-consumed" style="width:${nowPct}%"></div>
         <div class="gantt-nowline" style="left:${nowPct}%"><span class="now-flag">${prog.allDone ? 'done' : fmtDur(elapsed)}</span></div>
       </div>`
    : '';

  // Calculated done time = projected clock time the whole meal is ready.
  const remainingMs = Math.max(0, prog.timelineMs - elapsed);
  const doneClock = fmtClock(Date.now() + remainingMs);

  // Head sub-line: the meal-done countdown + clock (always shown).
  const doneLabel = run.started
    ? `🍽️ Ready in <b>${fmtDur(remainingMs)}</b> · ~${doneClock}`
    : `🍽️ Ready ~${doneClock} if you start now`;
  const detail = `<span class="gantt-sub">${doneLabel}</span>`;
  // Tapping a step block opens a larger detail panel below the head.
  let detailPanel = '';
  if (selected) {
    const pd = prog.dishes[selected.di];
    const ps = pd && pd.steps && pd.steps[selected.si];
    if (ps) detailPanel = stepDetail(pd, ps, elapsed);
  }

  // The next timed step to begin (soonest waiting), for the countdown.
  let nextUp = null;
  for (const d of prog.dishes) {
    if (!d.included || !d.steps) continue;
    for (const st of d.steps) {
      if (st.prep || st.redundant || st.state !== 'waiting') continue;
      if (!nextUp || st.projStart < nextUp.step.projStart) nextUp = { dish: d, step: st };
    }
  }

  // Timed action bar: the current timed task + its live countdown (the timeline
  // advances on its own — no tap needed), or a wait message.
  let bar = '';
  if (run.started && !prog.allDone) {
    const ta = prog.timedActions[0];
    if (ta) {
      const s = ta.step;
      const remain = s.projEnd - elapsed;
      const over = remain <= 0;
      const nextLine = nextUp
        ? `<div class="timed-next">⏭ Next: <b>${escapeHtml(nextUp.step.label)}</b> (${escapeHtml(nextUp.dish.name)}) in <span class="tn-count">${fmtDur(Math.max(0, nextUp.step.projStart - elapsed))}</span></div>`
        : '';
      bar = `<div class="timed-now go">
        <span class="tn-emoji">${escapeHtml(ta.dish.emoji)}</span>
        <span class="tn-text"><b>${escapeHtml(s.label)}${s.shareCount > 1 ? ` <span class="ahead-tag shared-tag">shared ×${s.shareCount}</span>` : ''}</b><small>${escapeHtml(ta.dish.name)}</small></span>
        <span class="tn-count${over ? ' over' : ''}">${over ? 'go' : fmtDur(remain)}</span>
      </div>${nextLine}`;
    } else {
      bar = nextUp
        ? `<div class="timed-now wait">⏳ Next timed task is <b>${escapeHtml(nextUp.step.label)}</b> (${escapeHtml(nextUp.dish.name)}) in <span class="tn-count">${fmtDur(Math.max(0, nextUp.step.projStart - elapsed))}</span></div>`
        : `<div class="timed-now alldone">✓ All timed tasks done</div>`;
    }
  }

  // Cooking controls live at the BOTTOM with the Gantt.
  const paused = !isRunning();
  let cookBar;
  if (!schedule.includedCount) {
    cookBar = `<div class="cook-empty">No dishes chosen — tap 🍽️ up top to pick what you're cooking.</div>`;
  } else if (!run.started) {
    cookBar = `<div class="cook-controls">
      <button class="btn primary full" id="start-btn">▶ Start cooking</button>
    </div>`;
  } else if (prog.allDone) {
    cookBar = `<div class="timed-now alldone">🍽️ Meal ready — everything's done!</div>
      <div class="cook-controls"><button class="btn ghost full" id="reset-btn">Start over</button></div>`;
  } else {
    cookBar = `${bar}
      <div class="cook-controls">
        <button class="btn ghost sm" id="rew-btn" aria-label="Rewind 15 seconds">⏪ 15s</button>
        <button class="btn ${paused ? 'primary' : 'warn'}" id="pp-btn">${paused ? '▶ Resume' : '⏸ Pause'}</button>
        <button class="btn ghost" id="reset-btn">Reset</button>
        <button class="btn ghost sm" id="ff-btn" aria-label="Fast-forward 15 seconds">15s ⏩</button>
      </div>`;
  }

  el.gantt.innerHTML = `
    <div class="gantt-head">
      <span class="gantt-title">Meal timeline</span>
      ${detail}
    </div>
    ${detailPanel}
    ${cookBar}
    <div class="gantt-rows">
      ${rows || `<div class="gantt-empty">Choose dishes to see the timeline.</div>`}
      ${nowLayer}
    </div>`;
}

// ---------- Alerts (sound + vibration + notification) ----------
let audioCtx = null;
function primeAudio() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch (_) {}
}
function playChime() {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  [[880, 0], [1320, 0.18]].forEach(([freq, offset]) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const t = now + offset;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.3, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.4);
  });
}
function requestNotifyPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission().catch(() => {});
  }
}
function notify(title, body) {
  if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);
  playChime();
  if ('Notification' in window && Notification.permission === 'granted') {
    try { new Notification(title, { body, icon: 'icons/icon-192.png', tag: 'cook-with-me' }); } catch (_) {}
  }
}

// Prep to-do list: tap anywhere on a row to toggle it complete (the whole row
// is the tap target, not just the checkbox — easier to hit on touch).
el.hero.addEventListener('click', (e) => {
  if (e.target.closest('#prep-toggle')) { prepExpanded = !prepExpanded; render(); return; }
  const row = e.target.closest('.pt-item');
  if (!row) return;
  const chk = row.querySelector('.pt-check');
  if (chk) { toggleStepDone(chk.dataset.id, +chk.dataset.si); return; }
});
el.gantt.addEventListener('click', (e) => {
  if (e.target.closest('#start-btn')) { startMeal(); return; }
  if (e.target.closest('#rew-btn')) { nudgeClock(-15000); return; }
  if (e.target.closest('#ff-btn')) { nudgeClock(15000); return; }
  if (e.target.closest('#pp-btn')) { isRunning() ? pauseMeal() : resumeMeal(); return; }
  if (e.target.closest('#reset-btn')) {
    if (isAllDone() || confirm('Reset the whole meal timer?')) resetMeal();
    return;
  }
  if (e.target.closest('#detail-close')) { selected = null; render(); return; }
  const seg = e.target.closest('.gseg');
  if (!seg) return;
  const di = +seg.dataset.di, si = +seg.dataset.si;
  selected = (selected && selected.di === di && selected.si === si) ? null : { di, si };
  render();
});

el.chooseTop.addEventListener('click', openPicker);

// ---------- Dish picker ----------
function openPicker() { renderPicker(); el.picker.hidden = false; }
function closePicker() { el.picker.hidden = true; }

function renderPicker() {
  el.pickerList.innerHTML = schedule.dishes.map((d) => {
    const on = d.included;
    const steps = d.steps.length;
    return `
      <button class="pick-row${on ? ' on' : ''}" data-id="${escapeHtml(d.id)}" aria-pressed="${on}">
        <span class="pick-check">${on ? '✓' : ''}</span>
        <span class="pick-emoji">${escapeHtml(d.emoji)}</span>
        <span class="pick-name"><strong>${escapeHtml(d.name)}</strong><small>${fmtLen(d.durationMs)} · ${steps} step${steps === 1 ? '' : 's'}</small></span>
      </button>`;
  }).join('');
}

el.picker.addEventListener('click', (e) => {
  if (e.target === el.picker) { closePicker(); return; }
  const row = e.target.closest('.pick-row');
  if (row) { toggleDish(row.dataset.id); renderPicker(); }
});
el.pickerClose.addEventListener('click', closePicker);
el.pickerDone.addEventListener('click', closePicker);

// ---------- Boot ----------
// Pin the app to the REAL visible height. `100dvh` resolves short in some iOS
// contexts (in-app browsers, standalone PWAs, older Safari), leaving a gap at
// the bottom and crushing the timeline; window.innerHeight is always the true
// visible height. Update on resize / rotation / foreground.
function syncAppHeight() {
  const h = window.innerHeight;
  if (h) document.documentElement.style.setProperty('--app-h', h + 'px');
}

function init() {
  const vEl = document.getElementById('version');
  if (vEl) vEl.textContent = 'V' + (self.APP_VERSION || '0');

  syncAppHeight();
  window.addEventListener('resize', syncAppHeight);
  window.addEventListener('orientationchange', syncAppHeight);
  window.addEventListener('pageshow', syncAppHeight);

  meal = loadMeal();
  schedule = computeSchedule(meal);
  run = loadRun();
  // Prime alert state from the current progress so reopening a running meal
  // doesn't re-chime every already-available task.
  const prog0 = computeProgress();
  lastActiveKeys = new Set(progActionKeys(prog0));
  mealDoneNotified = prog0.allDone;
  if (isRunning() && !prog0.allDone) startTicking();
  refresh();

  // Launch the dish picker at startup (only when not mid-cook).
  if (!run.started) openPicker();
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => console.warn('SW registration failed', err));
  });
}

// Re-sync when the app returns to foreground (wall clock may have jumped, and
// the visible height may have changed while backgrounded).
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  syncAppHeight();
  if (isRunning()) refresh();
});

init();
// Re-measure once the viewport settles (iOS reports innerHeight late on load).
window.addEventListener('load', syncAppHeight);
setTimeout(syncAppHeight, 300);
