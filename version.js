// Single source of truth for the app version.
// Works in both the page (window) and the service worker (self).
// Bump this on every deploy — the UI shows it and the service worker uses it
// to name its cache, so a new version busts the old offline cache.
self.APP_VERSION = '1.0.0';
