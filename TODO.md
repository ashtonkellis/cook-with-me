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
