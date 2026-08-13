# Cook With Me

A master timer PWA for cooking an entire meal. Set one **serve time**, add each
dish with how long it takes, and the app schedules every dish backward so the
whole meal is ready at once — with a live countdown and an alert as each dish's
start moment arrives.

## Features

- **Synchronized schedule** — everything finishes together, computed from a single serve time
- **Live countdown + alerts** — sound chime, vibration, and a system notification per dish
- **Installable PWA** — add to home screen, works fully offline
- **Persistent** — your plan survives reloads (localStorage)

## Run locally

It's a zero-build static site. Serve the folder with any static server:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

A server (not `file://`) is required so the service worker registers.

## Deploy (GitHub Pages)

`.github/workflows/deploy.yml` publishes the repo root on every push to `main`.
One-time setup: in the repo, go to **Settings → Pages → Build and deployment**
and set **Source** to **GitHub Actions**. After the first run the app is live at
`https://<user>.github.io/cook-with-me/`.

## Project workflow

`TODO.md` tracks work — new requests go into **Todo**, finished work moves to
**Done**.

## Icons

App icons are generated (no external tooling) by `tools/gen_icons.py` from the
same design as `icons/icon.svg`. Regenerate with `python3 tools/gen_icons.py`.
