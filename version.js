// Single source of truth for the app version.
// Works in both the page (window) and the service worker (self).
// Simple versioning: a whole number shown as "V1", "V2", "V3"…
// Bump it by 1 on every deploy — the UI shows it and the service worker names
// its cache after it, so a new version busts the old offline cache.
self.APP_VERSION = '5';
