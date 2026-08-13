# Cook With Me — Project Workflow

Master timer PWA for cooking an entire meal. This file tracks work. New requests
go into **Todo**; finished work moves to **Done**.

## Todo

- [ ] Add a library of preset dishes with common step timings
      (blocked on the dish-model decision: single-duration vs. multi-step)

## In Progress

- (nothing yet)

## Blocked / needs decision

- Multi-step dishes (sear → oven → rest) vs. single total duration per dish.
  Changes the data model; presets build on top of whichever we pick.

## Done

- [x] Establish todo-list workflow (this file)
- [x] Scaffold PWA: manifest, service worker, offline caching
- [x] Core "master timer" UI: add dishes, steps, compute a synchronized cook schedule
- [x] Add app icons (192px, 512px, maskable) generated from a pure-Python renderer
- [x] Persist meal plans to localStorage so they survive reloads
- [x] Sound chime + vibration + system notification alerts when a dish fires
- [x] Set up GitHub Pages deployment workflow
