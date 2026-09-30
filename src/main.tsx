import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App.tsx";
import { getTheme, applyTheme } from "./lib/theme";
import "./index.css";

// Sets the --theme-* CSS variables before React's first paint. Previously applyTheme() was only
// ever invoked from the theme-toggle buttons, so a browser that had never touched the toggle (or
// had localStorage cleared) rendered purely off index.css's hardcoded dark fallback values —
// this is what makes light the actual default, not just the fallback-of-last-resort.
applyTheme(getTheme());

// Registers the service worker and makes sure an already-open tab (or an installed PWA session,
// which may never be force-closed for days) actually picks up a new deploy instead of silently
// freezing on old code. `immediate: true` registers right away rather than waiting for window
// 'load'. The `controllerchange` listener is the missing piece that made staleness possible
// before: once a NEW service worker finishes installing and takes control of this page, reload
// once so the page re-fetches its JS/CSS from the now-current worker instead of continuing to run
// whatever bundle was already in memory. The `refreshing` guard stops a rare double-fire (some
// browsers can emit this event more than once in quick succession) from reloading twice in a row.
if ('serviceWorker' in navigator) {
  registerSW({ immediate: true });

  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
}

createRoot(document.getElementById("root")!).render(<App />);
