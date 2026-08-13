# Cook With Me — Project Workflow

Master meal-timer PWA. One **Start** button launches a whole meal; each dish's
steps are sequenced so every dish finishes at the same moment. This file tracks
work — new requests go into **Todo**, finished work moves to **Done**.

## Todo

- [ ] Reorder dishes / steps in the editor
- [ ] Multiple saved meals (pick from a list)
- [ ] Per-step "now" marker line on the timeline bar (finer than segment fill)

## Recently added workflows (see CLAUDE.md)

- Versioning: `version.js` is the single source; UI footer shows it; bump on
  every deploy; tell the user which version to expect after deploying.
- Deploy: push to `main` → auto-deploys to GitHub Pages (user authorized
  pushing to main).

## In Progress

- (nothing — core is done)

## Done

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
