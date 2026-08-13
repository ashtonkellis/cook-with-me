# Cook With Me

A master timer PWA for cooking an entire meal. One **Start** button launches the
whole meal; each dish's steps are sequenced so **every dish finishes at the same
moment** — with a live countdown, a "next step" indicator, and per-dish timers.

Live: **https://ashtonkellis.github.io/cook-with-me/**

## Features

- **Sequenced schedule** — each dish starts at `mealDuration − dishDuration`, so
  everything is ready together (Chicken 21m, Rice 16m, Veggies 19m → Rice starts
  5 min in, Veggies 2 min in)
- **Stacked per-dish timers** — each with an emoji, status pill (Waiting /
  Cooking / Done), a big countdown, and a segmented step-timeline bar
- **Next-step hero** — overall meal countdown plus the next step and a decreasing
  timer to when it starts
- **One Start button** for the whole meal, plus Pause / Reset
- **Survives close/reopen** — timers are wall-clock based and persisted, so
  progress is never reset (the food really keeps cooking)
- **Alerts** — chime, vibration, and a system notification as each step begins
- **Editable** — add/edit/remove dishes, steps, and per-dish emoji in-app
- **Installable & offline** — add to home screen, works with no network

## Versioning

The current version is shown in the app footer (e.g. `v1.0.0`) and defined in
one place: `version.js`. It is bumped on every deploy (semver: patch = fix,
minor = feature, major = rewrite). The service worker names its offline cache
after the version, so a new deploy automatically refreshes the cached app.

## Run locally

Zero build — serve the folder with any static server (needed so the service
worker registers; `file://` won't work):

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## Test

`tools/smoke.mjs` is a headless Playwright smoke test (scheduling, next-step,
persistence, editor, done-state, version):

```bash
python3 -m http.server 8123 &   # serve the folder
node tools/smoke.mjs
```

## Deploy (GitHub Pages)

`.github/workflows/deploy.yml` publishes the repo root on every push to `main`.
One-time setup: **Settings → Pages → Build and deployment → Source =
"GitHub Actions"**. After the first run the app is live at
`https://ashtonkellis.github.io/cook-with-me/`.

## Project workflow

See `CLAUDE.md` for the working conventions (todo tracking in `TODO.md`,
versioning, deploy, and testing). App icons are generated (no external tooling)
by `tools/gen_icons.py`.
