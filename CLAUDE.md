# Cook With Me — project memory

A published PWA that acts as a master timer for cooking a whole meal. One
**Start** button launches every dish; each dish's steps are sequenced so all
dishes finish at the same moment. Zero build step — plain HTML/CSS/JS.

## Workflows (follow these every session)

### Todo-list workflow
- `TODO.md` is the shared tracker with **Todo**, **In Progress**, **Done** (and
  a **Blocked / needs input** section when relevant).
- When the user makes a request, add it to **Todo**.
- When a task is finished, move it to **Done**.
- When idle, work on the next item in **Todo**.

### Versioning workflow
- The version lives in ONE place: `version.js` (`self.APP_VERSION`) — a simple
  whole number (`'1'`, `'2'`, `'3'`…), NOT semver.
- The UI shows it in the footer as `V1`; the service worker names its cache
  after it, so bumping the version busts the old offline cache.
- **On every deploy, increment `version.js` by 1** (V1 → V2 → V3…).
- **After deploying, always tell the user which version they should see** once
  the deploy finishes (e.g. "you should now see V2"). This lets them confirm
  the fix landed and the cache refreshed.

### Deployment workflow
- The user has authorized pushing directly to `main`.
- Pushing to `main` triggers `.github/workflows/deploy.yml`, which publishes the
  repo root to GitHub Pages at `https://ashtonkellis.github.io/cook-with-me/`.
- One-time GitHub setup (only the user can do it): repo **Settings → Pages →
  Source = "GitHub Actions"**.
- Deploy flow: bump `version.js` → commit → push `main` → tell the user the
  version to expect.

### Testing before deploy
- `tools/smoke.mjs` is a headless Playwright smoke test (scheduling, next-step,
  persistence-across-reload, editor, done-state, version). Run it before
  deploying: `node tools/smoke.mjs` (a static server must serve the folder,
  e.g. `python3 -m http.server 8123`).

## Architecture notes
- **Scheduler** (`computeSchedule`): each dish starts at
  `mealDuration − dishDuration` so all dishes end together.
- **Timers are wall-clock based**: run state is derived from an absolute
  timestamp (`runningSince` + `accumMs`), persisted to localStorage, so closing/
  reopening never resets — the food really keeps cooking. Pause freezes elapsed.
- **Dishes** = `{ id, name, emoji, included, steps: [...] }`. A step is
  `{ label, minutes, note?, ahead?, shared? }`:
  - `ahead` — can be done any time (not gated to its scheduled start).
  - `shared` — same-labeled shared steps across included dishes are one physical
    task, owned by the earliest dish; redundant copies are skipped/auto-done.
  - `included` picks which dishes are in the meal (chosen in the picker modal).
  Emoji is the per-dish "image". A dish library (BBQ dishes + fast test dishes)
  is seeded; the 3 test dishes are selected by default.
- **Guided model**: `computeProgress()` projects step times/states from actual
  completions (`run.doneSteps`), yielding the one-at-a-time action queue and the
  live Gantt. Completion is fully manual ("Tap when complete").
- Files: `index.html`, `styles.css`, `app.js`, `version.js`, `sw.js`,
  `manifest.webmanifest`, `icons/`.
- **Icons**: `icons/icon-source.png` is the master art. Regenerate the app
  sizes (192/512/maskable) with `python3 tools/resize_icon.py icons/icon-source.png`
  (pure-Python PNG decode/resize, no deps). `tools/gen_icons.py` is the older
  procedural fallback.

## Conventions
- Match the Wing Weather visual language: dark stacked cards, status pills, a
  colored left accent bar per card, big tabular-nums countdowns.
- Keep it dependency-free and buildless so GitHub Pages serves it as-is.
