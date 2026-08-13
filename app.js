// Cook With Me — master meal timer
// Schedules each dish backward from a single serve time so everything finishes together.

const state = {
  dishes: [], // { id, name, minutes }
  serveAt: null, // ms timestamp, set when cooking starts
  running: false,
};

let tickHandle = null;

// ---- Elements ----
const el = {
  serveMins: document.getElementById('serve-mins'),
  serveClock: document.getElementById('serve-clock'),
  dishForm: document.getElementById('dish-form'),
  dishName: document.getElementById('dish-name'),
  dishMins: document.getElementById('dish-mins'),
  dishesCard: document.getElementById('dishes-card'),
  dishesList: document.getElementById('dishes-list'),
  scheduleCard: document.getElementById('schedule-card'),
  timeline: document.getElementById('timeline'),
  startBtn: document.getElementById('start-btn'),
  stopBtn: document.getElementById('stop-btn'),
  countdown: document.getElementById('countdown'),
  countdownTime: document.getElementById('countdown-time'),
};

// ---- Helpers ----
const uid = () => Math.random().toString(36).slice(2, 9);

function fmtClock(ms) {
  const d = new Date(ms);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function fmtDuration(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Serve time in ms from now, based on whichever control the user set.
function resolveServeOffsetMs() {
  const clock = el.serveClock.value;
  if (clock) {
    const [hh, mm] = clock.split(':').map(Number);
    const now = new Date();
    const target = new Date();
    target.setHours(hh, mm, 0, 0);
    if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1); // next day
    return target.getTime() - now.getTime();
  }
  const mins = parseInt(el.serveMins.value, 10) || 0;
  return mins * 60 * 1000;
}

// ---- Persistence ----
const STORE_KEY = 'cook-with-me:plan';

function savePlan() {
  try {
    const clock = el.serveClock.value;
    const mins = el.serveMins.value;
    localStorage.setItem(STORE_KEY, JSON.stringify({ dishes: state.dishes, serveClock: clock, serveMins: mins }));
  } catch (_) { /* storage may be unavailable (private mode); ignore */ }
}

function loadPlan() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (Array.isArray(data.dishes)) {
      state.dishes = data.dishes.filter((d) => d && d.name && d.minutes).map((d) => ({
        id: d.id || uid(),
        name: String(d.name),
        minutes: Number(d.minutes),
      }));
    }
    if (data.serveClock) el.serveClock.value = data.serveClock;
    else if (data.serveMins) el.serveMins.value = data.serveMins;
  } catch (_) { /* corrupt data; start fresh */ }
}

// ---- Dishes ----
function addDish(name, minutes) {
  state.dishes.push({ id: uid(), name, minutes });
  savePlan();
  render();
}

function removeDish(id) {
  state.dishes = state.dishes.filter((d) => d.id !== id);
  savePlan();
  render();
}

function renderDishes() {
  el.dishesList.innerHTML = '';
  for (const d of state.dishes) {
    const li = document.createElement('li');
    li.innerHTML = `
      <div class="dish-info">
        <strong>${escapeHtml(d.name)}</strong>
        <small>${d.minutes} min</small>
      </div>
      <button class="remove-btn" aria-label="Remove ${escapeHtml(d.name)}">×</button>`;
    li.querySelector('.remove-btn').addEventListener('click', () => removeDish(d.id));
    el.dishesList.appendChild(li);
  }
  el.dishesCard.hidden = state.dishes.length === 0;
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---- Schedule ----
// Each dish starts at (serveAt - minutes). Returns events sorted by time.
function buildSchedule(serveAt) {
  const events = state.dishes.map((d) => ({
    id: d.id,
    at: serveAt - d.minutes * 60 * 1000,
    name: d.name,
    minutes: d.minutes,
  }));
  events.sort((a, b) => a.at - b.at);
  return events;
}

function renderSchedule() {
  el.scheduleCard.hidden = state.dishes.length === 0;
  if (state.dishes.length === 0) return;

  // Preview uses "ready in" offset from now if not yet running.
  const serveAt = state.serveAt ?? Date.now() + resolveServeOffsetMs();
  const events = buildSchedule(serveAt);
  const now = Date.now();

  el.timeline.innerHTML = '';
  for (const ev of events) {
    const li = document.createElement('li');
    const started = state.running && now >= ev.at;
    const soon = state.running && !started && ev.at - now < 60 * 1000;
    if (started) li.classList.add('done');
    if (soon) li.classList.add('now');
    li.innerHTML = `
      <span class="t-when">${fmtClock(ev.at)}</span>
      <span class="t-what"><strong>Start ${escapeHtml(ev.name)}</strong><small>${ev.minutes} min · ready ${fmtClock(serveAt)}</small></span>`;
    el.timeline.appendChild(li);
  }

  // Serve event at the end
  const li = document.createElement('li');
  li.innerHTML = `
    <span class="t-when">${fmtClock(serveAt)}</span>
    <span class="t-what"><strong>🍽️ Serve!</strong><small>Everything ready</small></span>`;
  el.timeline.appendChild(li);
}

// ---- Live cooking ----
function startCooking() {
  const offset = resolveServeOffsetMs();
  if (offset <= 0) return;
  const serveAt = Date.now() + offset;

  // Warn if a dish takes longer than time-to-serve.
  const longest = Math.max(...state.dishes.map((d) => d.minutes), 0);
  if (longest * 60 * 1000 > offset) {
    const ok = confirm(
      `Heads up: "${state.dishes.find((d) => d.minutes === longest).name}" needs ${longest} min but serve is in ${Math.round(offset / 60000)} min. Start anyway?`
    );
    if (!ok) return;
  }

  state.serveAt = serveAt;
  state.running = true;
  state.firedIds = new Set();
  el.startBtn.hidden = true;
  el.countdown.hidden = false;
  tickHandle = setInterval(tick, 500);
  tick();
  render();
}

function stopCooking() {
  state.running = false;
  state.serveAt = null;
  clearInterval(tickHandle);
  el.startBtn.hidden = false;
  el.countdown.hidden = true;
  render();
}

function tick() {
  if (!state.running || !state.serveAt) return;
  const now = Date.now();
  const remaining = state.serveAt - now;
  el.countdownTime.textContent = remaining > 0 ? fmtDuration(remaining) : 'Serve!';

  // Fire alerts as each dish's start time passes.
  const events = buildSchedule(state.serveAt);
  for (const ev of events) {
    if (!state.firedIds.has(ev.id) && now >= ev.at) {
      state.firedIds.add(ev.id);
      notify(`Start ${ev.name}`, `${ev.minutes} min to go`);
    }
  }
  if (remaining <= 0 && !state.firedIds.has('__serve__')) {
    state.firedIds.add('__serve__');
    notify('🍽️ Serve!', 'Everything is ready');
    stopCooking();
  }

  renderSchedule();
}

// Placeholder alert — sound/vibration land in a later task.
function notify(title, body) {
  if ('vibrate' in navigator) navigator.vibrate(200);
  console.log(`[alert] ${title} — ${body}`);
}

// ---- Render ----
function render() {
  renderDishes();
  renderSchedule();
}

// ---- Events ----
el.dishForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = el.dishName.value.trim();
  const minutes = parseInt(el.dishMins.value, 10);
  if (!name || !minutes) return;
  addDish(name, minutes);
  el.dishForm.reset();
  el.dishName.focus();
});

el.serveMins.addEventListener('input', () => { el.serveClock.value = ''; savePlan(); renderSchedule(); });
el.serveClock.addEventListener('input', () => { savePlan(); renderSchedule(); });
el.startBtn.addEventListener('click', startCooking);
el.stopBtn.addEventListener('click', stopCooking);

// ---- Service worker ----
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => console.warn('SW registration failed', err));
  });
}

loadPlan();
render();
