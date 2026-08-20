# Cook With Me — Project Workflow

Master meal-timer PWA. One **Start** button launches a whole meal; each dish's
steps are sequenced so every dish finishes at the same moment. This file tracks
work — new requests go into **Todo**, finished work moves to **Done**.

## Todo

- (nothing outstanding)

## In Progress

- (nothing in progress)

## Backlog / ideas (not scheduled — don't gate deploys)

- [ ] Reorder dishes / steps in the editor
- [ ] Multiple saved meals (pick from a list)
- [ ] Optional fast "test meal" for quick end-to-end testing

## Done

- [x] **Remove completed prep from the list + shrink-to-fit Gantt (V28)** —
  - Completing a prep task now **removes it from the list** (only pending tasks
    show); done tasks live behind a **"▸ Show N completed"** toggle. The list
    shrinks as you work, which frees the Gantt more room.
  - **Gantt lanes shrink to fit** (`flex: 1 1 0; min-height: 0`, `overflow:
    hidden`) so every dish stays visible with no scrollbar, however many are
    selected — and grow to fill the screen when there's room.
- [x] **Rename thighs + add BBQ chicken breast (V27)** — renamed "BBQ chicken" to
      "BBQ chicken thighs"; added "BBQ chicken breast" with the same steps but a
      9-min cook time per side (thighs are 8). Breast is `included: false` by
      default (an alternative to thighs — available in the picker). Both chicken
      dishes share "Preheat BBQ", so it's done once when both are in the meal.
- [x] **Fix step-detail reflow + Gantt fill (V26)** —
  - **Step-detail is now a floating overlay** (absolute inside the Gantt card),
    so tapping a step's info no longer reflows/pushes the timeline lanes out of
    view — they stay put behind the panel and return exactly on Close.
  - **Gantt bars fill the lanes**: tracks grow with the (flex) lanes (capped
    ~104px) instead of floating at a fixed 46px, so the chart fills the screen.
    As a bonus this cleared the last of the iPhone-SE cooking clipping.
- [x] **Collapse the prep section when all prep is done (V25)** — once every prep
      task is checked off, the top section collapses to just the "All prep done"
      banner plus a "▸ Show N prep steps" toggle; the individual items are hidden
      until the user expands them (and can collapse again). Frees the Gantt even
      more room. While prep is still pending, the full detailed list always shows.
- [x] **Picker deselect/reset + Gantt fill + axis removal (V24)** —
  - **Fixed can't-deselect in the picker**: `toggleDish` no longer bails when a
    meal is started, so the picker works any time (the guard was blocking all
    toggles once cooking had begun).
  - **Changing the dish selection now resets the run** — timers AND prep
    checkboxes — to a clean, not-started state.
  - **Removed the bottom axis** (`0:00` / `Serve · 21:00`).
  - **Gantt fills the screen**: lanes are `flex: 1 1 0` and grow to use the
    vertical space (taller tracks, capped ~46px), no big empty gaps, no scroll.
- [x] **Gantt sort, fill, casing, double-tap, stale-cache fix (V23)** —
  - **Gantt lanes now sort by cook-start time** (earliest-starting dish on top),
    so Stir-fried veggies (starts 8 min in) sits ABOVE Rice (11 min in). The prep
    to-do list follows the same cook-start order.
  - **Confirmed total time excludes prep** — `computeSchedule` only sums timed
    steps; smoke test asserts Serve · 21:00.
  - **Gantt fills the remaining screen** — lanes spread evenly (`space-evenly`)
    and never scroll (`overflow: hidden`); all lanes visible at once.
  - **Casing audit** — "🍽️ Ready…", "Serve · 21:00" (capitalize first word after
    the emoji, matching the rest of the UI).
  - **Confirmed there's no Done button in the Gantt** (removed back in V20) —
    users still seeing one were on a stale cache; see the SW fix below.
  - **Disabled double-tap-to-zoom** (`touch-action: manipulation`) so rapid taps
    on the ±15s / Pause controls register immediately (pinch-zoom still works).
  - **Service worker is now network-first for the app shell**, so new deploys
    land immediately instead of being pinned to an old cached version.
- [x] **Fit the whole app on one iPhone screen, no scroll (V22)** — reworked the
      layout so the hero (prep) card shrinks (`flex: 0 1 auto`) and the Gantt card
      keeps a `min-height` floor, so the timeline is never crushed off-screen.
      Compacted the prep rows, header, footer, and main gaps; a
      `@media (max-height: 720px)` block clamps prep notes to one line for iPhone
      SE / mini. Verified with measurements + screenshots at 375×667, 390×844,
      and 402×874 (all fit, no clip, no page scroll); smoke test now asserts
      `no-clip` for the prep list and Gantt lanes, not just no page scroll.
- [x] **Detail/prep/no-editor batch (V21)** —
  - Tapping a Gantt step opens a larger **step-detail panel** (emoji, label,
    status pill, scheduled clock window, full note, Close) instead of a one-liner.
  - The prep to-do list is **bigger and shows each step's detail** (dish,
    duration, note) while prep is pending; it **collapses to a compact checklist**
    once all prep is done so the Gantt keeps its room.
  - **Prep-ready dishes are far more obvious** in the Gantt: green-tinted lane,
    green left accent bar, green track outline, and a filled "✓ Prep done" pill.
  - **Removed dish editing entirely** (the ⚙️ editor + all editor logic + the
    picker's "Edit dishes"). Dishes are now **code-sourced from `EXAMPLE_MEAL`**;
    only the include/exclude selection is persisted, which **purges old/test
    dishes** from stale localStorage. Edit dishes via GitHub pushes.
  - **Casing audit**: dish/step/note data already consistent (sentence case);
    aligned the Gantt gutter statuses + pills to match ("Prep only", "✓ Done",
    "Go now", "In 3:00", "No prep needed").
  - **Confirmed scheduling excludes prep from total time** (verified in
    `computeSchedule` + a new smoke assertion: total = 21:00, prep not counted).
- [x] **Remove tap-to-complete timed steps (V20)** — dropped the Gantt "✓ Done"
      button and all its logic (`markDone`, `maybeJumpAhead`, the `#timed-done`
      handler, the doneSteps-driven timed states). Timed steps now complete
      automatically as the wall clock passes their scheduled end; the current-
      task bar is informational (task + live countdown). Prep completion stays
      manual in the top to-do list. `computeProgress` rebuilt as a two-pass,
      clock-driven model; smoke test updated to verify auto-completion.
- [x] **Prep/UI polish batch (V19)** — auto-heal stale saved meals so the seed
      dishes always get the right prep categorization (fixes prep steps showing
      in the Gantt on old localStorage data, run once via a migration flag);
      removed the "Choose dishes" button from the Gantt (header 🍽️ icon only,
      full-width Start cooking); whole prep row is now a tap target (fixes hard-
      to-tap "Prep veggies" near the scroll edge); subtle tap feedback (scale +
      brightness) on buttons, icons, prep rows, and Gantt blocks; meal-done
      countdown + clock ("ready in 20:44 · ~9:19 PM"); removed the "Load example
      meal" footer link.
- [x] **Cooking-flow batch (V18)** — dishes with no prep count as prep-ready
      (green); "Choose dishes" moved to a header icon; calculated done time
      ("ready ~7:51 PM"); countdown to the next step while cooking; tapping Done
      when only one dish remains jumps the clock to that dish's next step;
      ⏪ 15s / ⏩ 15s buttons next to Pause/Reset; "all prep done — ready to
      cook!" banner in the prep section.
- [x] **Two-section layout: prep on top, cooking on the bottom** — TOP is the
      prep to-do list (all prep tasks, doable any time — even before cooking);
      BOTTOM holds the "Start cooking" button, the timed action bar / Pause /
      Reset, and the Gantt. Prep list sorts in Gantt/dish order. When all of a
      dish's prep is done, that dish turns green in the Gantt (name, emoji ring,
      track outline).
- [x] **Prep to-do list + compressed Gantt + step info icons** — the top card
      now lists ALL prep tasks (done + pending) as a checklist in cook order,
      current item highlighted with its note; the Gantt is vertically compressed
      (shorter, packed lanes); every timed step shows an ⓘ icon and tapping a
      block reveals its details in the header.
- [x] **Trim to 3 dishes** — BBQ chicken (prep & season = prep; preheat/side1/side2
      = timed), Rice (cook = timed; measure/wash + setup = prep), Stir-fried
      veggies (prep = prep; preheat pan + cook = timed). All selected by default.
      (Removed the fast test dishes — the ~15s end-to-end shortcut is gone.)
- [x] **Core meal-timer rewrite** — full requested feature set:
  - [x] Data model: dish = { name, emoji, steps[] }; example 3-dish meal seeded
  - [x] Scheduler: sequence each dish so all finish together (start = mealDur − dishDur)
  - [x] Stacked dish cards, Wing-Weather visual language (verified via screenshot)
  - [x] Emoji image per dish line (🍗 🍚 🥦)
  - [x] Single Start button for the whole meal (+ Pause / Reset)
  - [x] Hero: overall meal countdown + "next step starts in mm:ss"
  - [x] Per-dish segmented step-timeline bar with progress fill
  - [x] Step-start & meal-done alerts (chime + vibration + notification)
  - [x] Wall-clock persistence: timers survive close/reopen, no reset (verified)
- [x] **In-app meal editor** — add/edit/remove dishes, steps, and per-dish emoji
- [x] **Version indicator in the UI** + single-source versioning (`version.js`)
- [x] **Per-step notes** — optional note on each step (settings, temps, reminders),
      shown in the active dish card + hero next-step, editable in the editor
- [x] **Custom app icon** — user-provided skillet/timer art, resized to
      192/512/maskable via `tools/resize_icon.py` (retired the placeholder SVG)
- [x] **Palette matched to the icon** — royal navy bg, amber (#fca602) & leaf
      green (#37c57b) accents, sampled directly from the icon art
- [x] **No-scroll layout** — the whole app fits one screen (verified: FITS)
- [x] **Gantt-chart timeline** — dishes as lanes, colored step blocks (dish=hue,
      step=shade), a sweeping "now" line, tap a block to read its note
- [x] **Confirmed synchronized finish** — smoke test asserts every dish ends at
      100% of the timeline (all finish together ✓)
- [x] **Include/exclude dishes** — checkbox per dish in the idle Gantt; schedule
      re-balances live so included dishes finish together; Start disabled if none
- [x] **Dish library expanded** — added BBQ steak, BBQ chicken breast, BBQ corn,
      boiled veggies, and fast test chicken/rice/veggies (test dishes selected
      by default for a ~15s end-to-end run)
- [x] **Guided action cards** — one "DO THIS" task card at a time with a
      "Tap when complete" button; completions are recorded (persisted) and the
      remaining steps/timeline re-project from actual completion times. Tasks
      become available on the staggered schedule; the Gantt shows done/active
      states and the now-line advances live.
- [x] **Startup dish picker modal** — selection moved to a "Choose dishes" modal
      that launches at startup; the idle Gantt now previews only chosen dishes
      (reopen via the hero button or when nothing's selected).
- [x] **"Wait" standing-by message** — "Next task is ___ (dish) starting in ___".
- [x] **Prep-ahead steps** — per-step `ahead` flag (editable). Ahead steps (e.g.
      Prep veggies) become available immediately; gated steps still wait for
      their scheduled start so the dish finishes on time. Shown with a "prep
      ahead" tag on the action card and an outline on the Gantt block.
- [x] **Prep ordering + per-dish prep status** — prep tasks are ordered by when
      their dish's timed cooking begins (earliest-cooking dish's prep first). Each
      Gantt lane shows its prep status: amber ring + "N prep left" while pending,
      green ring + "✓ prep ready" once that dish's prep is done.
- [x] **Prep vs timed tasks** — per-step `prep` flag (editable; replaces `ahead`).
      Prep tasks are untimed do-any-time tasks shown as a to-do list + hero at the
      top; timed tasks are scheduled and shown in the Gantt at the bottom with a
      "current timed task" action bar. Prep tasks are excluded from the
      finish-together timeline.
- [x] **Shared steps** — per-step `shared` flag (editable). Same-labeled shared
      steps across dishes (e.g. "Preheat BBQ") become one task owned by the
      earliest dish; redundant copies are skipped as actions and shown as
      "↔ shared / ✓ shared" hatched blocks in the Gantt. Seeded on the BBQ
      dishes' "Preheat BBQ".
- [x] **Project memory** (`CLAUDE.md`) capturing todo, versioning, deploy workflows

- [x] Establish todo-list workflow (this file)
- [x] Scaffold PWA: manifest, cache-first service worker, offline caching
- [x] Add app icons (192px, 512px, maskable) generated from a pure-Python renderer
- [x] Persist state to localStorage
- [x] Sound chime + vibration + system notification alerts
- [x] GitHub Pages deploy workflow (publishes repo root on push to `main`)

## Blocked / needs your input

- **Go-live:** GitHub Pages needs (1) `main` to receive this code and (2)
  Settings → Pages → Source = "GitHub Actions" (one-time, only you can do it).
  Say the word and I'll open a PR to `main`.
