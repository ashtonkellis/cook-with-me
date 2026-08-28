# Cook With Me — project memory

A published PWA that acts as a master timer for cooking a whole meal. One
**Start** button launches every dish; each dish's steps are sequenced so all
dishes finish at the same moment. Zero build step — plain HTML/CSS/JS.

## Workflows (follow these every session)

### Todo-list workflow
- `TODO.md` is the shared tracker with **Todo**, **In Progress**, **Done** (and
  a **Blocked / needs input** section when relevant).
- **Add EVERY request to `TODO.md` (Todo) the moment it comes in** — including
  each item when the user sends several at once, and new items that arrive
  mid-task. Capture first, then act.
- **Work items ONE AT A TIME.** Move an item to **In Progress** when you start
  it and to **Done** the moment it's finished, before starting the next. Don't
  lump many requests into a single blob of work — track and complete each
  individually so the list always reflects real state.
- When idle, work on the next item in **Todo**.
- Batch only the *deploy* (see Deployment workflow), never the tracking: the
  list should be updated per-item even though the push to `main` waits until the
  Todo / In Progress sections are clear.

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
  `mealDuration − dishDuration` so all dishes end together. Only TIMED steps
  count toward a dish's duration / the meal total — prep steps are excluded.
- **Lane + prep order**: Gantt lanes and the prep to-do list are sorted by each
  dish's cook-**start** time (earliest-starting dish on top), ties by definition
  order. So a dish that starts cooking sooner sits above one that starts later.
- **Service worker is network-first for the app shell** (`sw.js`): navigations
  and HTML/JS/CSS/manifest are fetched from the network when online (falling back
  to cache offline), so a new deploy lands immediately instead of being pinned to
  a stale cache. Icons/images stay cache-first. Bumping `version.js` still renames
  the cache and purges the old one on activate.
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
  Emoji is the per-dish "image" — thighs 🍗 vs breast 🐔 differ on purpose so the
  two chicken dishes are easy to tell apart; Gantt lane names also wrap to 2 lines
  (`.gn` line-clamp) so "…thighs" vs "…breast" is readable, not truncated to "BBQ
  chicke…". Seed dishes: BBQ chicken thighs, BBQ chicken
  breast + Steak (extras — `included: false` by default), Rice, Stir-fried
  veggies. Both chicken dishes share "Preheat BBQ" (done once when both are in);
  Steak's preheat is a separate "Preheat the grill" step (own label, so it does
  NOT merge with the chicken preheat). Steak's timeline (5+8+8 + a 5m "Let rest")
  is 26m, so it anchors the meal when selected.
- **The meal is code-sourced — there is NO in-app editor.** `EXAMPLE_MEAL` in
  `app.js` is the single source of truth for dish/step content; edit dishes by
  pushing changes to that file. The app persists ONLY the per-dish include/
  exclude selection (`cook-with-me:included`, a `{id: bool}` map) plus run state
  — never the dish content — so stale/old saved meals (and any leftover test
  dishes) can't reappear. `loadMeal()` deep-copies the seed and overlays the
  saved selection; legacy `cook-with-me:meal` / `:migrated` keys are purged on
  load. The picker (🍽️ header icon) toggles which dishes are included and works
  ANY time (even mid-cook); **changing the selection resets the run** (timers +
  prep checkboxes) via `resetMeal()`, since a new selection is a different meal.
- **Header actions**: two icon buttons top-right — 🍽️ (choose dishes) and 🔄
  (Reset, `#reset-top` → `requestReset()`, which confirms unless nothing's
  started / the meal's already done). Reset lives ONLY in the header now; the
  bottom cooking controls are just ⏪15s / Pause / ⏩15s. The done state still
  shows a full-width "Start over".
- **Completed prep is removed from the list**: the top prep to-do shows only
  PENDING tasks (full detail — dish, duration, note); completing one drops it
  from the list, so the list shrinks as you work and frees the Gantt more room.
  Done tasks live behind a `#prep-toggle` ("▸ Show N completed", `prepExpanded`
  in-memory) that reveals them (compact, struck-through) in a `.done-list`. When
  all prep is done the pending list is empty and only the "All prep done" banner
  + toggle remain.
- **Gantt step detail**: tapping a step block opens a `.step-detail` panel
  (emoji, label, status pill, scheduled clock window, full note, Close). It is
  an ABSOLUTE overlay inside the (relative) Gantt card, so it floats over the
  timeline and never reflows/clips the lanes.
- **Gantt fills the screen & shrinks to fit**: `.gantt-row`s are `flex: 1 1 0`
  with `min-height: 0`, so the lanes grow to share the timeline area AND shrink
  so every dish stays visible without a scrollbar, however many are selected.
  The tracks (`height: 100%`, capped ~104px) grow with them so the bars fill the
  lanes. `.gantt-rows` is `overflow: hidden` — all lanes visible, never scroll.
  There is no bottom axis row (the old `0:00 / Serve · N` was removed).
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
- **Text casing**: sentence case everywhere (capitalize the first word of a
  phrase/label; number-led phrases keep the number first — "3 prep left"). Proper
  nouns keep their caps (BBQ, Instant Pot). ALL-CAPS is only via CSS
  `text-transform` for section labels (`.hero-label`) and pills (`.ahead-tag` /
  `.tn-count.over`) — don't hardcode uppercase in strings.
- **One-screen fit (no scroll)**: `body` is `height: var(--app-h, 100dvh);
  overflow: hidden`, a flex column of header / `main` / footer. `--app-h` is set
  from `window.innerHeight` in JS (`syncAppHeight`, on load/resize/rotate/
  foreground) because `100dvh` resolves SHORT in some iOS contexts (in-app
  browsers, standalone PWAs, older Safari) — leaving a gap at the bottom and
  crushing the timeline. Pinning to the real visible height fixes both. Inside `main`, the hero (prep) card
  is `flex: 0 1 auto` (shrinks but never grows past its content) and the Gantt
  card is `flex: 1 1 auto` with a `min-height` floor so the timeline is never
  crushed off-screen. The prep list (`.prep-todo`) is the only internal scroll,
  as a last resort on very short screens. A `@media (max-height: 720px)` block
  clamps prep notes to one line for iPhone SE / mini. When changing row heights
  or paddings, re-run `tools/smoke.mjs` — it asserts `no-clip` (prep list AND
  Gantt lanes fully visible) at 402×874, not just that the page doesn't scroll.
