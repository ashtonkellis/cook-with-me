// Cook With Me — master meal timer
// One Start button launches a whole meal. Each dish's steps are sequenced so
// every dish finishes at the same moment. Timers are derived from an absolute
// start timestamp (wall clock), so closing/reopening never resets progress.

// ---------- Seed dish library ----------
// `included` picks which dishes are in tonight's meal (chosen via checkboxes
// before starting). By default only the fast TEST dishes are selected, so the
// app opens ready for a ~15-second end-to-end run.
const EXAMPLE_MEAL = {
  name: 'BBQ cookout',
  dishes: [
    {
      id: 'chicken', name: 'Chicken thighs', emoji: '🍗', included: false,
      steps: [
        { label: 'Preheat BBQ', minutes: 5, note: 'Medium-high, ~450°F. Oil the grates.' },
        { label: 'Cook side 1', minutes: 8, note: 'Skin-side down. Don’t move them — let the skin crisp.' },
        { label: 'Cook side 2', minutes: 8, note: 'Flip once. Pull at 175°F internal.' },
      ],
    },
    {
      id: 'rice', name: 'Rice', emoji: '🍚', included: false,
      steps: [
        { label: 'Set up Instant Pot', minutes: 3, note: 'Add rinsed rice + 1:1 water. Seal, valve to Sealing.' },
        { label: 'Measure & wash rice', minutes: 3, note: '2 cups rice, rinse until water runs clear.' },
        { label: 'Cook rice', minutes: 10, note: 'Instant Pot: Manual / Pressure Cook, 3 min, then natural release.' },
      ],
    },
    {
      id: 'veggies', name: 'Stir-fried veggies', emoji: '🥦', included: false,
      steps: [
        { label: 'Prep veggies', minutes: 6, note: 'Broccoli, peppers, snap peas — bite-size, uniform.' },
        { label: 'Preheat pan', minutes: 3, note: 'Wok or skillet, high heat, 1 tbsp oil until shimmering.' },
        { label: 'Cook veggies', minutes: 10, note: 'Toss constantly. Add garlic + soy at the end.' },
      ],
    },
    {
      id: 'steak', name: 'BBQ steak', emoji: '🥩', included: false,
      steps: [
        { label: 'Preheat BBQ', minutes: 5, note: 'High heat for a good sear.' },
        { label: 'Cook side 1', minutes: 8 },
        { label: 'Cook side 2', minutes: 8 },
        { label: 'Rest', minutes: 5, note: 'Tent with foil — let the juices settle.' },
      ],
    },
    {
      id: 'chicken-breast', name: 'BBQ chicken breast', emoji: '🐔', included: false,
      steps: [
        { label: 'Preheat BBQ', minutes: 5 },
        { label: 'Cook side 1', minutes: 15 },
        { label: 'Cook side 2', minutes: 15, note: 'Pull at 165°F internal.' },
      ],
    },
    {
      id: 'corn', name: 'BBQ corn', emoji: '🌽', included: false,
      steps: [
        { label: 'Preheat BBQ', minutes: 5 },
        { label: 'Side 1', minutes: 5 },
        { label: 'Side 2', minutes: 5 },
        { label: 'Side 3', minutes: 5 },
        { label: 'Side 4', minutes: 5 },
      ],
    },
    {
      id: 'boiled-veggies', name: 'Boiled veggies', emoji: '🫑', included: false,
      steps: [
        { label: 'Boil water', minutes: 5 },
        { label: 'Cook veggies', minutes: 10 },
      ],
    },
    {
      id: 'test-chicken', name: 'Test chicken', emoji: '🐔', included: true,
      steps: [
        { label: 'Preheat', minutes: 0.08, note: 'Fast test step.' },
        { label: 'Side 1', minutes: 0.08 },
        { label: 'Side 2', minutes: 0.08 },
      ],
    },
    {
      id: 'test-rice', name: 'Test rice', emoji: '🍚', included: true,
      steps: [
        { label: 'Setup', minutes: 0.05 },
        { label: 'Wash', minutes: 0.05 },
        { label: 'Cook', minutes: 0.08 },
      ],
    },
    {
      id: 'test-veggies', name: 'Test veggies', emoji: '🥗', included: true,
      steps: [
        { label: 'Prep', minutes: 0.05 },
        { label: 'Preheat', minutes: 0.05 },
        { label: 'Cook', minutes: 0.08 },
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
let run = { started: false, runningSince: null, accumMs: 0 };
let lastElapsedMs = 0;        // for edge-triggered step chimes
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

// ---------- Scheduling ----------
// Included dishes each start at (mealDuration - dishDuration) so they all end
// together. Excluded dishes are kept (for the idle picker) but not scheduled.
function computeSchedule(m) {
  const dishes = m.dishes.map((d) => {
    const dur = d.steps.reduce((s, st) => s + st.minutes, 0) * MIN;
    return { ...d, included: d.included !== false, durationMs: dur };
  });
  const included = dishes.filter((d) => d.included);
  const mealMs = Math.max(0, ...included.map((d) => d.durationMs));
  for (const d of dishes) {
    if (d.included) {
      d.startMs = mealMs - d.durationMs;
      let cursor = d.startMs;
      d.steps = d.steps.map((st) => {
        const start = cursor;
        const len = st.minutes * MIN;
        cursor += len;
        return { ...st, lenMs: len, startMs: start, endMs: cursor };
      });
      d.endMs = mealMs; // every included dish finishes with the meal
    } else {
      d.startMs = null;
      d.endMs = null;
      d.steps = d.steps.map((st) => ({ ...st, lenMs: st.minutes * MIN, startMs: null, endMs: null }));
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
function elapsedMs() {
  if (!run.started) return 0;
  const running = run.runningSince != null;
  const live = running ? Date.now() - run.runningSince : 0;
  return Math.min(run.accumMs + live, schedule.mealMs);
}
const isRunning = () => run.started && run.runningSince != null;
const isDone = () => run.started && elapsedMs() >= schedule.mealMs;

function startMeal() {
  if (!schedule.includedCount) return; // nothing selected
  primeAudio();
  requestNotifyPermission();
  run = { started: true, runningSince: Date.now(), accumMs: 0 };
  lastElapsedMs = 0;
  saveRun();
  startTicking();
  render();
}
function pauseMeal() {
  if (!isRunning()) return;
  run.accumMs += Date.now() - run.runningSince;
  run.runningSince = null;
  saveRun();
  stopTicking();
  render();
}
function resumeMeal() {
  if (!run.started || isRunning() || isDone()) return;
  run.runningSince = Date.now();
  saveRun();
  startTicking();
  render();
}
function resetMeal() {
  run = { started: false, runningSince: null, accumMs: 0 };
  lastElapsedMs = 0;
  saveRun();
  stopTicking();
  render();
}

function startTicking() {
  stopTicking();
  tickHandle = setInterval(tick, 250);
}
function stopTicking() {
  if (tickHandle) { clearInterval(tickHandle); tickHandle = null; }
}

function tick() {
  const now = elapsedMs();

  // Edge-triggered chimes for step-starts crossed since last tick.
  for (const s of allStepStarts()) {
    if (s.at > 0 && s.at > lastElapsedMs && s.at <= now) {
      notify(`${s.dish.emoji} ${s.step.label}`, s.dish.name);
    }
  }
  if (schedule.mealMs > lastElapsedMs && now >= schedule.mealMs) {
    notify('🍽️ Meal ready!', 'Everything is done — plate up.');
  }
  lastElapsedMs = now;

  render();

  if (isDone()) { stopTicking(); saveRun(); }
}

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
      if (r && typeof r.started === 'boolean') return r;
    }
  } catch (_) {}
  return { started: false, runningSince: null, accumMs: 0 };
}

// ---------- Rendering ----------
function stateColor(name) {
  return name === 'done' ? 'var(--done)' : name === 'active' ? 'var(--active)' : 'var(--waiting)';
}

function render() {
  renderHero();
  renderGantt();
}

function renderHero() {
  const elapsed = elapsedMs();
  const remaining = schedule.mealMs - elapsed;

  if (!run.started) {
    const n = schedule.includedCount;
    const none = n === 0;
    el.hero.innerHTML = `
      <div class="hero-top">
        <span class="hero-label">Ready to cook</span>
        <span class="hero-clock">${none ? 'pick dishes below' : `${n} dish${n === 1 ? '' : 'es'} · ~${fmtLen(schedule.mealMs)}`}</span>
      </div>
      <div class="hero-time">${none ? '—' : fmtDur(schedule.mealMs)}</div>
      <div class="controls">
        <button class="btn primary" id="start-btn"${none ? ' disabled' : ''}>▶ Start meal</button>
      </div>`;
    const btn = el.hero.querySelector('#start-btn');
    if (!none) btn.addEventListener('click', startMeal);
    return;
  }

  if (isDone()) {
    el.hero.innerHTML = `
      <div class="hero-top"><span class="hero-label">Meal complete</span></div>
      <div class="hero-time">🍽️ Ready!</div>
      <div class="controls">
        <button class="btn ghost" id="reset-btn">Start over</button>
      </div>`;
    el.hero.querySelector('#reset-btn').addEventListener('click', resetMeal);
    return;
  }

  // Running or paused. Find the next step that hasn't started yet.
  const upcoming = allStepStarts().find((s) => s.at > elapsed);
  const readyAt = Date.now() + remaining;
  const nextHtml = upcoming
    ? `<div class="next-step">
         <span class="ns-emoji">${escapeHtml(upcoming.dish.emoji)}</span>
         <span class="ns-text"><strong>Next: ${escapeHtml(upcoming.step.label)}</strong><small>${escapeHtml(upcoming.dish.name)}</small>${upcoming.step.note ? `<small class="ns-note">📝 ${escapeHtml(upcoming.step.note)}</small>` : ''}</span>
         <span class="ns-count">${fmtDur(upcoming.at - elapsed)}</span>
       </div>`
    : `<div class="next-step">
         <span class="ns-emoji">🔥</span>
         <span class="ns-text"><strong>Final stretch</strong><small>All dishes are underway</small></span>
         <span class="ns-count">${fmtDur(remaining)}</span>
       </div>`;

  const paused = !isRunning();
  el.hero.innerHTML = `
    <div class="hero-top">
      <span class="hero-label">${paused ? 'Paused' : 'Meal ready in'}</span>
      <span class="hero-clock">done ~${fmtClock(readyAt)}</span>
    </div>
    <div class="hero-time">${fmtDur(remaining)}</div>
    ${nextHtml}
    <div class="controls">
      <button class="btn ${paused ? 'primary' : 'warn'}" id="pp-btn">${paused ? '▶ Resume' : '⏸ Pause'}</button>
      <button class="btn ghost" id="reset-btn">Reset</button>
    </div>`;
  el.hero.querySelector('#pp-btn').addEventListener('click', paused ? resumeMeal : pauseMeal);
  el.hero.querySelector('#reset-btn').addEventListener('click', () => {
    if (confirm('Reset the whole meal timer?')) resetMeal();
  });
}

// Distinct hue per dish; steps within a dish graduate in lightness so each
// block is its own shade — dish = hue, step = shade (easy to grok).
const DISH_HUES = [38, 199, 152, 344, 264, 24, 96, 320];
function dishHue(i) { return DISH_HUES[i % DISH_HUES.length]; }
function stepColor(hue, idx, total) {
  const l = total <= 1 ? 58 : 48 + Math.round((idx / (total - 1)) * 26); // 48%..74%
  return `hsl(${hue} 80% ${l}%)`;
}

function renderGantt() {
  const elapsed = elapsedMs();
  const mealMs = schedule.mealMs || 1;
  const pct = (ms) => Math.max(0, Math.min(100, (ms / mealMs) * 100));
  const nowPct = pct(elapsed);

  const picking = !run.started; // idle: show checkboxes + all dishes
  const rows = schedule.dishes.map((d, di) => {
    // When running, only included dishes appear.
    if (run.started && !d.included) return '';
    const hue = dishHue(di);
    const excluded = !d.included;

    // Per-dish status shown in the label gutter.
    let status, statusCls;
    if (!run.started) { status = fmtLen(d.durationMs); statusCls = excluded ? 'off' : ''; }
    else if (elapsed < d.startMs) { status = `in ${fmtDur(d.startMs - elapsed)}`; statusCls = 'wait'; }
    else if (elapsed >= d.endMs) { status = '✓ done'; statusCls = 'done'; }
    else {
      const cur = d.steps.find((s) => elapsed >= s.startMs && elapsed < s.endMs) || d.steps[d.steps.length - 1];
      status = `${fmtDur(cur.endMs - elapsed)} left`; statusCls = 'cook';
    }

    // Excluded dishes have no timeline position — show no blocks.
    const segs = excluded ? '' : d.steps.map((s, si) => {
      const left = pct(s.startMs), width = Math.max(0.8, pct(s.endMs) - pct(s.startMs));
      const active = run.started && elapsed >= s.startMs && elapsed < s.endMs;
      const isSel = selected && selected.di === di && selected.si === si;
      const wideEnough = width >= 9;
      return `<div class="gseg${active ? ' active' : ''}${isSel ? ' sel' : ''}" data-di="${di}" data-si="${si}" style="left:${left}%;width:${width}%;background:${stepColor(hue, si, d.steps.length)}" title="${escapeHtml(s.label)} · ${fmtLen(s.lenMs)}${s.note ? ' — ' + escapeHtml(s.note) : ''}">${wideEnough ? `<span>${escapeHtml(s.label)}</span>` : ''}</div>`;
    }).join('');

    const check = picking
      ? `<button class="dish-check${excluded ? '' : ' on'}" data-id="${escapeHtml(d.id)}" aria-label="${excluded ? 'Include' : 'Exclude'} ${escapeHtml(d.name)}" aria-pressed="${excluded ? 'false' : 'true'}">${excluded ? '' : '✓'}</button>`
      : '';

    return `
      <div class="gantt-row${excluded ? ' excluded' : ''}">
        <div class="gantt-label">
          ${check}
          <span class="ge">${escapeHtml(d.emoji)}</span>
          <span class="gtxt"><span class="gn">${escapeHtml(d.name)}</span><span class="gs ${statusCls}">${status}</span></span>
        </div>
        <div class="gantt-track" style="--hue:${hue}">${segs}</div>
      </div>`;
  }).join('');

  const nowLayer = run.started
    ? `<div class="gantt-now-layer">
         <div class="gantt-consumed" style="width:${nowPct}%"></div>
         <div class="gantt-nowline" style="left:${nowPct}%"><span class="now-flag">${isDone() ? 'done' : fmtDur(elapsed)}</span></div>
       </div>`
    : '';

  // Detail line: the tapped step's note (or a hint).
  let detail = `<span class="gantt-sub">${picking ? 'check dishes to include · all finish together →' : 'tap a block for its note · all finish together →'}</span>`;
  if (selected) {
    const sd = schedule.dishes[selected.di];
    const ss = sd && sd.steps[selected.si];
    if (ss) {
      detail = `<span class="gantt-detail">${escapeHtml(sd.emoji)} <b>${escapeHtml(ss.label)}</b> · ${fmtLen(ss.lenMs || (ss.minutes * MIN))}${ss.note ? ` — 📝 ${escapeHtml(ss.note)}` : ' — no note'}</span>`;
    }
  }

  const total = fmtDur(mealMs);
  el.gantt.innerHTML = `
    <div class="gantt-head">
      <span class="gantt-title">Meal timeline</span>
      ${detail}
    </div>
    <div class="gantt-rows">
      ${rows}
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
// Gantt interactions: toggle a dish's checkbox, or tap a block to read its note.
el.gantt.addEventListener('click', (e) => {
  const check = e.target.closest('.dish-check');
  if (check) { toggleDish(check.dataset.id); return; }
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
});

// ---------- Boot ----------
function init() {
  const vEl = document.getElementById('version');
  if (vEl) vEl.textContent = 'V' + (self.APP_VERSION || '0');

  meal = loadMeal();
  meal.dishes.forEach((d) => { if (!d.id) d.id = uid(); });
  schedule = computeSchedule(meal);
  run = loadRun();
  if (isRunning()) { lastElapsedMs = elapsedMs(); startTicking(); }
  render();
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => console.warn('SW registration failed', err));
  });
}

// Re-sync when the app returns to foreground (wall clock may have jumped).
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && isRunning()) { lastElapsedMs = elapsedMs(); render(); }
});

init();
