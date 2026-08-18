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
- **Only deploy (push to `main`) when the TODO **Todo** and **In Progress**
  sections are EMPTY** — i.e. all outstanding requests are done. Don't push
  after every individual change; batch the work and deploy once the list is
  clear. Commit locally as you go (fine to commit to the working branch), but
  hold the `main` push + version bump until the list is empty. The
  **Backlog / ideas** section holds unscheduled ideas and does NOT gate deploys.
- Pushing to `main` triggers `.github/workflows/deploy.yml`, which publishes the
  repo root to GitHub Pages at `https://ashtonkellis.github.io/cook-with-me/`.
- One-time GitHub setup (only the user can do it): repo **Settings → Pages →
  Source = "GitHub Actions"**.
- Deploy flow (when the list is empty): bump `version.js` **once** → commit →
  push `main` → tell the user the version to expect.

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
  `{ label, minutes, note?, prep?, shared? }`:
  - `prep` — untimed do-any-time task (legacy `ahead` still honored). Prep tasks
    are excluded from the timeline and shown as a to-do list + hero at the TOP;
    timed steps are scheduled and shown in the Gantt at the BOTTOM.
  - `shared` — same-labeled shared steps across included dishes are one physical
    task, owned by the earliest dish; redundant copies are skipped/auto-done.
  - `included` picks which dishes are in the meal (chosen in the picker modal).
  Emoji is the per-dish "image". Seeded meal: BBQ chicken, Rice, Stir-fried
  veggies (all selected by default).
- **Progress model**: `computeProgress()` projects each step onto the shared
  timeline (a two-pass build) and derives states. **Timed steps complete
  automatically as the wall clock passes their scheduled end** — there is no
  manual "Done" button in the Gantt. **Prep steps stay manual**: they're ticked
  off any time (even before cooking) in the top to-do list, stored in
  `run.doneSteps`. The meal is `allDone` when every timed step's time has passed
  AND all prep is checked off.
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
