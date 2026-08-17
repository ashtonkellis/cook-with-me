// Cook With Me — master meal timer
// One Start button launches a whole meal. Each dish's steps are sequenced so
// every dish finishes at the same moment. Timers are derived from an absolute
// start timestamp (wall clock), so closing/reopening never resets progress.

// ---------- Seed dish library ----------
// `included` picks which dishes are in tonight's meal (chosen via checkboxes
// before starting). By default only the fast TEST dishes are selected, so the
// app opens ready for a ~15-second end-to-end run.
const EXAMPLE_MEAL = {
  name: 'BBQ dinner',
  dishes: [
    {
      id: 'chicken', name: 'BBQ chicken', emoji: '🍗', included: true,
      steps: [
        { label: 'Prep & season chicken', minutes: 5, prep: true, note: 'Pat dry, salt + rub, bring to room temp.' },
        { label: 'Preheat BBQ', minutes: 5, shared: true, note: 'Medium-high, ~450°F. Oil the grates.' },
        { label: 'Cook side 1', minutes: 8, note: 'Skin-side down. Don’t move them — let the skin crisp.' },
        { label: 'Cook side 2', minutes: 8, note: 'Flip once. Pull at 175°F internal.' },
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

const MEAL_KEY = 'cook-with-me:meal';
const RUN_KEY = 'cook-with-me:run';

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

// ---------- Elements ----------
const el = {
  hero: document.getElementById('hero'),
  dishes: document.getElementById('dishes'),
  gantt: document.getElementById('gantt'),
  resetExample: document.getElementById('reset-example'),
  editBtn: document.getElementById('edit-btn'),
  editor: document.getElementById('editor'),
  editorDishes: document.getElementById('editor-dishes'),
  editorClose: document.getElementById('editor-close'),
  editorCancel: document.getElementById('editor-cancel'),
  editorSave: document.getElementById('editor-save'),
  addDish: document.getElementById('add-dish'),
  picker: document.getElementById('picker'),
  pickerList: document.getElementById('picker-list'),
  pickerClose: document.getElementById('picker-close'),
  pickerDone: document.getElementById('picker-done'),
  pickerEdit: document.getElementById('picker-edit'),
};

// ---------- Helpers ----------
const uid = () => Math.random().toString(36).slice(2, 9);
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
// Compact duration for totals: seconds when short (test dishes), else minutes.
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

// Toggle a dish in/out of the meal (only before the meal has started).
function toggleDish(id) {
  if (run.started) return;
  const d = meal.dishes.find((x) => x.id === id);
  if (!d) return;
  d.included = !(d.included !== false);
  saveMeal();
  schedule = computeSchedule(meal);
  render();
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
// Elapsed time in the meal (wall-clock based, pause-aware). Not capped — with
// manual completion the meal can run past its planned duration.
function elapsedMs() {
  if (!run.started) return 0;
  const live = run.runningSince != null ? Date.now() - run.runningSince : 0;
  return run.accumMs + live;
}
const isRunning = () => run.started && run.runningSince != null;
const stepKey = (dishId, si) => `${dishId}:${si}`;

// Is a step marked complete? Completion times are stored in meal-elapsed ms.
function isStepDone(dishId, si) {
  return run.doneSteps ? stepKey(dishId, si) in run.doneSteps : false;
}
function isAllDone() {
  if (!run.started) return false;
  return schedule.dishes.filter((d) => d.included)
    .every((d) => d.steps.every((_, si) => isStepDone(d.id, si)));
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
  const done = run.doneSteps || {};
  const shared = sharedInfo();
  const dishes = [];
  const timedActions = [];
  const prepPending = [];
  const prepAll = [];
  let timelineMs = schedule.mealMs;
  let timedTotal = 0, timedDone = 0, prepTotal = 0, prepDone = 0;

  for (let di = 0; di < schedule.dishes.length; di++) {
    const d = schedule.dishes[di];
    if (!d.included) { dishes.push({ ...d, di }); continue; }
    let cursor = 0;
    let timedActionFound = false;
    const steps = d.steps.map((s, si) => {
      const key = stepKey(d.id, si);
      const sh = shared[key];
      const redundant = sh && !sh.isOwner;
      const ownerDone = sh ? sh.ownerKey in done : false;
      const finished = key in done || (redundant && ownerDone);
      const shareCount = sh ? sh.count : 0;

      if (s.prep) {
        if (!redundant) { prepTotal++; if (finished) prepDone++; }
        const state = finished ? 'done' : (redundant ? (ownerDone ? 'shared-done' : 'shared') : 'pending');
        const entry = { di, si, key, dish: d, step: { ...s, si, key, shareCount }, done: finished };
        if (!redundant) prepAll.push(entry);
        if (!redundant && !finished) prepPending.push(entry);
        return { ...s, si, key, state, redundant, shareCount };
      }

      // timed step — projected onto the shared meal timeline
      const projStart = Math.max(cursor, s.startMs || 0);
      let projEnd, state;
      if (redundant) {
        projEnd = projStart + s.lenMs;
        state = ownerDone ? 'shared-done' : 'shared';
      } else if (finished) {
        projEnd = done[key];
        state = 'done';
        timedTotal++; timedDone++;
      } else {
        timedTotal++;
        projEnd = projStart + s.lenMs;
        if (!timedActionFound) {
          timedActionFound = true;
          state = elapsed >= projStart - 1 ? 'active' : 'waiting';
          if (state === 'active') timedActions.push({ di, si, dish: d, step: { ...s, si, key, projStart, projEnd, shareCount } });
        } else {
          state = 'waiting';
        }
      }
      cursor = projEnd;
      return { ...s, si, key, projStart, projEnd, state, redundant, shareCount };
    });
    timelineMs = Math.max(timelineMs, cursor);
    dishes.push({ ...d, di, steps });
  }

  timedActions.sort((a, b) => a.step.projStart - b.step.projStart);
  // Prep tasks are ordered by when their dish's timed cooking begins — so the
  // prep for the dish that starts cooking first is first in the list.
  // Prep to-do list order matches the order dishes appear in the Gantt (row/di
  // order), then step order within a dish.
  const byGanttOrder = (a, b) => (a.di - b.di) || (a.si - b.si);
  prepPending.sort(byGanttOrder);
  prepAll.sort(byGanttOrder);
  const totalSteps = prepTotal + timedTotal;
  const doneCount = prepDone + timedDone;
  return {
    elapsed, dishes, timedActions, prepPending, prepAll, timelineMs,
    prepTotal, prepDone, timedTotal, timedDone, totalSteps, doneCount,
    allDone: totalSteps > 0 && doneCount === totalSteps,
  };
}

function markDone(dishId, si) {
  if (!run.started) return;
  run.doneSteps = run.doneSteps || {};
  run.doneSteps[stepKey(dishId, si)] = elapsedMs();
  if ('vibrate' in navigator) navigator.vibrate(30);
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
function saveMeal() {
  try { localStorage.setItem(MEAL_KEY, JSON.stringify(meal)); } catch (_) {}
}
function saveRun() {
  try { localStorage.setItem(RUN_KEY, JSON.stringify(run)); } catch (_) {}
}
function loadMeal() {
  try {
    const raw = localStorage.getItem(MEAL_KEY);
    if (raw) {
      const m = JSON.parse(raw);
      if (m && Array.isArray(m.dishes) && m.dishes.length) return m;
    }
  } catch (_) {}
  return JSON.parse(JSON.stringify(EXAMPLE_MEAL));
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
      <div class="hero-top"><span class="hero-label">🔪 Prep</span><span class="hero-clock">no prep needed</span></div>
      <div class="prep-empty">No prep tasks — start cooking below ↓</div>`;
    return;
  }

  const currentKey = prog.prepPending[0] ? prog.prepPending[0].key : null;
  const items = prepAll.map((p) => {
    const isCur = p.key === currentKey;
    const s = p.step;
    return `
      <li class="pt-item${p.done ? ' done' : ''}${isCur ? ' current' : ''}">
        <button class="pt-check" data-id="${escapeHtml(p.dish.id)}" data-si="${p.si}" aria-label="${p.done ? 'Undo' : 'Complete'} ${escapeHtml(s.label)}">${p.done ? '✓' : ''}</button>
        <span class="pt-emoji">${escapeHtml(p.dish.emoji)}</span>
        <span class="pt-text">
          <b>${escapeHtml(s.label)}${s.shareCount > 1 ? ` <span class="ahead-tag shared-tag">shared ×${s.shareCount}</span>` : ''}</b>
          <small>${escapeHtml(p.dish.name)}${isCur && s.note ? ` · <span class="pt-note">📝 ${escapeHtml(s.note)}</span>` : ''}</small>
        </span>
      </li>`;
  }).join('');
  el.hero.innerHTML = `
    <div class="hero-top">
      <span class="hero-label">🔪 Prep — do any time</span>
      <span class="hero-clock">${prog.prepDone}/${prog.prepTotal} prep done</span>
    </div>
    <ul class="prep-todo">${items}</ul>`;
}

// Distinct hue per dish; steps within a dish graduate in lightness so each
// block is its own shade — dish = hue, step = shade (easy to grok).
const DISH_HUES = [38, 199, 152, 344, 264, 24, 96, 320];
function dishHue(i) { return DISH_HUES[i % DISH_HUES.length]; }
function stepColor(hue, idx, total) {
  const l = total <= 1 ? 58 : 48 + Math.round((idx / (total - 1)) * 26); // 48%..74%
  return `hsl(${hue} 80% ${l}%)`;
}

function renderGantt(prog) {
  const elapsed = prog.elapsed;
  const scaleMs = (run.started ? prog.timelineMs : schedule.mealMs) || 1;
  const pct = (ms) => Math.max(0, Math.min(100, (ms / scaleMs) * 100));
  const nowPct = pct(elapsed);

  const picking = !run.started;
  // Only chosen dishes appear (selection now happens in the picker modal).
  const rows = prog.dishes.map((d) => {
    const di = d.di;
    if (!d.included) return '';
    const hue = dishHue(di);
    const excluded = false;

    const timedSteps = d.steps.filter((s) => !s.prep);

    // Per-dish prep status badge (prep tasks live up top; show here whether this
    // dish's prep is all done).
    const prepSteps = d.steps.filter((s) => s.prep && !s.redundant);
    const prepDoneN = prepSteps.filter((s) => s.state === 'done' || s.state === 'shared-done').length;
    const prepAllDone = prepSteps.length > 0 && prepDoneN === prepSteps.length;
    let prepBadge = '';
    if (prepSteps.length) {
      if (prepAllDone) prepBadge = `<span class="lane-prep done">✓ prep ready</span>`;
      else if (prepDoneN > 0) prepBadge = `<span class="lane-prep pending">🔪 ${prepSteps.length - prepDoneN} prep left</span>`;
      else prepBadge = `<span class="lane-prep">🔪 ${prepSteps.length} prep</span>`;
    }

    // Per-dish status shown in the label gutter (timed steps only).
    let status, statusCls;
    if (!run.started) {
      status = fmtLen(d.durationMs); statusCls = '';
    } else if (!timedSteps.length) {
      status = 'prep only'; statusCls = '';
    } else {
      const active = timedSteps.find((s) => s.state === 'active');
      const waiting = timedSteps.find((s) => s.state === 'waiting');
      if (timedSteps.every((s) => s.state === 'done' || s.state === 'shared-done')) { status = '✓ done'; statusCls = 'done'; }
      else if (active) { const r = active.projEnd - elapsed; status = r <= 0 ? 'go now' : `${fmtDur(r)} left`; statusCls = 'cook'; }
      else if (waiting) { status = `in ${fmtDur(Math.max(0, waiting.projStart - elapsed))}`; statusCls = 'wait'; }
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

    const geCls = `ge${prepSteps.length ? (prepAllDone ? ' prep-ready' : ' prep-pending') : ''}`;
    return `
      <div class="gantt-row${prepAllDone ? ' prep-ready' : ''}">
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

  // Detail line: the tapped step's note (or a hint).
  let detail = `<span class="gantt-sub">${picking ? 'your chosen dishes · all finish together →' : 'tap a block for its note'}</span>`;
  if (selected) {
    const sd = schedule.dishes[selected.di];
    const ss = sd && sd.steps[selected.si];
    if (ss) {
      detail = `<span class="gantt-detail">${escapeHtml(sd.emoji)} <b>${escapeHtml(ss.label)}</b> · ${fmtLen(ss.lenMs || (ss.minutes * MIN))}${ss.note ? ` — 📝 ${escapeHtml(ss.note)}` : ' — no note'}</span>`;
    }
  }

  // Timed action bar: the current timed task (with Done), or a wait message.
  let bar = '';
  if (run.started && !prog.allDone) {
    const ta = prog.timedActions[0];
    if (ta) {
      const s = ta.step;
      const remain = s.projEnd - elapsed;
      const over = remain <= 0;
      bar = `<div class="timed-now go">
        <span class="tn-emoji">${escapeHtml(ta.dish.emoji)}</span>
        <span class="tn-text"><b>${escapeHtml(s.label)}${s.shareCount > 1 ? ` <span class="ahead-tag shared-tag">shared ×${s.shareCount}</span>` : ''}</b><small>${escapeHtml(ta.dish.name)}</small></span>
        <span class="tn-count${over ? ' over' : ''}">${over ? 'go' : fmtDur(remain)}</span>
        <button class="btn primary tn-done" id="timed-done" data-id="${escapeHtml(ta.dish.id)}" data-si="${s.si}">✓ Done</button>
      </div>`;
    } else {
      let soonest = null;
      for (const d of prog.dishes) {
        if (!d.included || !d.steps) continue;
        const nx = d.steps.find((st) => !st.prep && st.state === 'waiting');
        if (nx && (!soonest || nx.projStart < soonest.step.projStart)) soonest = { dish: d, step: nx };
      }
      bar = soonest
        ? `<div class="timed-now wait">⏳ Next timed task is <b>${escapeHtml(soonest.step.label)}</b> (${escapeHtml(soonest.dish.name)}) in <span class="tn-count">${fmtDur(Math.max(0, soonest.step.projStart - elapsed))}</span></div>`
        : `<div class="timed-now alldone">✓ All timed tasks done</div>`;
    }
  }

  // Cooking controls live at the BOTTOM with the Gantt.
  const paused = !isRunning();
  let cookBar;
  if (!schedule.includedCount) {
    cookBar = `<div class="cook-controls"><button class="btn primary full" id="choose-btn">🍽️ Choose dishes</button></div>`;
  } else if (!run.started) {
    cookBar = `<div class="cook-controls">
      <button class="btn ghost" id="choose-btn">🍽️ Choose dishes</button>
      <button class="btn primary" id="start-btn">▶ Start cooking</button>
    </div>`;
  } else if (prog.allDone) {
    cookBar = `<div class="timed-now alldone">🍽️ Meal ready — everything's done!</div>
      <div class="cook-controls"><button class="btn ghost full" id="reset-btn">Start over</button></div>`;
  } else {
    cookBar = `${bar}
      <div class="cook-controls">
        <button class="btn ${paused ? 'primary' : 'warn'}" id="pp-btn">${paused ? '▶ Resume' : '⏸ Pause'}</button>
        <button class="btn ghost" id="reset-btn">Reset</button>
      </div>`;
  }

  const total = fmtDur(scaleMs);
  el.gantt.innerHTML = `
    <div class="gantt-head">
      <span class="gantt-title">Meal timeline</span>
      ${detail}
    </div>
    ${cookBar}
    <div class="gantt-rows">
      ${rows || `<div class="gantt-empty">Choose dishes to see the timeline.</div>`}
      ${nowLayer}
    </div>
    <div class="gantt-axis"><span>0:00</span><span class="ax-end">serve · ${total}</span></div>`;
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

// ---------- Editor ----------
let draft = null;
function openEditor() {
  draft = JSON.parse(JSON.stringify(meal));
  renderEditor();
  el.editor.hidden = false;
}
function closeEditor() { el.editor.hidden = true; draft = null; }

function renderEditor() {
  el.editorDishes.innerHTML = '';
  draft.dishes.forEach((d, di) => {
    const wrap = document.createElement('div');
    wrap.className = 'ed-dish';
    const steps = d.steps.map((s, si) => `
      <div class="ed-step" data-di="${di}" data-si="${si}">
        <div class="ed-step-main">
          <input class="ed-step-label" value="${escapeHtml(s.label)}" placeholder="Step" />
          <input class="ed-step-min" type="number" min="0" step="any" value="${s.minutes}" inputmode="decimal" />
          <button class="ed-remove ed-remove-step" aria-label="Remove step">✕</button>
        </div>
        <input class="ed-step-note" value="${escapeHtml(s.note || '')}" placeholder="Note (optional) — e.g. Instant Pot: Manual, 3 min" />
        <label class="ed-step-ahead"><input type="checkbox" class="ed-step-prep-cb"${(s.prep || s.ahead) ? ' checked' : ''} /> Prep task (untimed — do any time, shown in the prep list)</label>
        <label class="ed-step-ahead"><input type="checkbox" class="ed-step-shared-cb"${s.shared ? ' checked' : ''} /> Shared step — same-labeled steps are done once (e.g. Preheat BBQ)</label>
      </div>`).join('');
    wrap.innerHTML = `
      <div class="ed-dish-top">
        <input class="ed-emoji" value="${escapeHtml(d.emoji)}" maxlength="4" aria-label="Emoji" />
        <input class="ed-name" value="${escapeHtml(d.name)}" placeholder="Dish name" />
        <button class="ed-remove ed-remove-dish" aria-label="Remove dish">🗑</button>
      </div>
      <div class="ed-steps">${steps}</div>
      <button class="btn ghost ed-addstep" data-di="${di}">+ Add step</button>`;
    el.editorDishes.appendChild(wrap);
  });
}

// Read the DOM back into `draft` before structural changes / save.
function syncDraftFromDom() {
  const dishEls = el.editorDishes.querySelectorAll('.ed-dish');
  dishEls.forEach((de, di) => {
    draft.dishes[di].emoji = de.querySelector('.ed-emoji').value.trim() || '🍽️';
    draft.dishes[di].name = de.querySelector('.ed-name').value.trim() || 'Dish';
    de.querySelectorAll('.ed-step').forEach((se, si) => {
      draft.dishes[di].steps[si].label = se.querySelector('.ed-step-label').value.trim() || 'Step';
      const mins = parseFloat(se.querySelector('.ed-step-min').value);
      draft.dishes[di].steps[si].minutes = mins > 0 ? mins : 1; // supports fractional (test) minutes
      draft.dishes[di].steps[si].note = se.querySelector('.ed-step-note').value.trim();
      draft.dishes[di].steps[si].prep = se.querySelector('.ed-step-prep-cb').checked;
      delete draft.dishes[di].steps[si].ahead; // migrated to `prep`
      draft.dishes[di].steps[si].shared = se.querySelector('.ed-step-shared-cb').checked;
    });
  });
}

function saveEditor() {
  syncDraftFromDom();
  draft.dishes = draft.dishes.filter((d) => d.steps.length > 0);
  if (!draft.dishes.length) { alert('Add at least one dish with a step.'); return; }
  meal = draft;
  meal.dishes.forEach((d) => { if (!d.id) d.id = uid(); });
  saveMeal();
  schedule = computeSchedule(meal);
  resetMeal(); // editing changes the schedule; start fresh
  closeEditor();
}

// Editor event delegation
el.editorDishes.addEventListener('click', (e) => {
  const t = e.target;
  if (t.classList.contains('ed-remove-step')) {
    syncDraftFromDom();
    const row = t.closest('.ed-step');
    draft.dishes[+row.dataset.di].steps.splice(+row.dataset.si, 1);
    renderEditor();
  } else if (t.classList.contains('ed-remove-dish')) {
    syncDraftFromDom();
    const di = [...el.editorDishes.children].indexOf(t.closest('.ed-dish'));
    draft.dishes.splice(di, 1);
    renderEditor();
  } else if (t.classList.contains('ed-addstep')) {
    syncDraftFromDom();
    draft.dishes[+t.dataset.di].steps.push({ label: 'New step', minutes: 5, note: '' });
    renderEditor();
  }
});
el.addDish.addEventListener('click', () => {
  syncDraftFromDom();
  draft.dishes.push({ id: uid(), name: 'New dish', emoji: '🍽️', steps: [{ label: 'Step', minutes: 5, note: '' }] });
  renderEditor();
});
// Prep to-do list: tap a row's checkbox to toggle it complete.
el.hero.addEventListener('click', (e) => {
  const pt = e.target.closest('.pt-check');
  if (pt) { toggleStepDone(pt.dataset.id, +pt.dataset.si); return; }
});
el.gantt.addEventListener('click', (e) => {
  const td = e.target.closest('#timed-done');
  if (td) { markDone(td.dataset.id, +td.dataset.si); return; }
  if (e.target.closest('#choose-btn') || e.target.closest('#gantt-choose')) { openPicker(); return; }
  if (e.target.closest('#start-btn')) { startMeal(); return; }
  if (e.target.closest('#pp-btn')) { isRunning() ? pauseMeal() : resumeMeal(); return; }
  if (e.target.closest('#reset-btn')) {
    if (isAllDone() || confirm('Reset the whole meal timer?')) resetMeal();
    return;
  }
  const seg = e.target.closest('.gseg');
  if (!seg) return;
  const di = +seg.dataset.di, si = +seg.dataset.si;
  selected = (selected && selected.di === di && selected.si === si) ? null : { di, si };
  render();
});

el.editBtn.addEventListener('click', openEditor);
el.editorClose.addEventListener('click', closeEditor);
el.editorCancel.addEventListener('click', closeEditor);
el.editorSave.addEventListener('click', saveEditor);
el.editor.addEventListener('click', (e) => { if (e.target === el.editor) closeEditor(); });

el.resetExample.addEventListener('click', () => {
  if (!confirm('Load the example meal? This replaces the current meal.')) return;
  meal = JSON.parse(JSON.stringify(EXAMPLE_MEAL));
  saveMeal();
  schedule = computeSchedule(meal);
  resetMeal();
  renderPicker();
});

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
el.pickerEdit.addEventListener('click', () => { closePicker(); openEditor(); });

// ---------- Boot ----------
function init() {
  const vEl = document.getElementById('version');
  if (vEl) vEl.textContent = 'V' + (self.APP_VERSION || '0');

  meal = loadMeal();
  meal.dishes.forEach((d) => { if (!d.id) d.id = uid(); });
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

// Re-sync when the app returns to foreground (wall clock may have jumped).
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && isRunning()) refresh();
});

init();
