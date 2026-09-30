import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      // Ships an updated service worker on every deploy and takes over immediately
      // (skipWaiting + clientsClaim under the hood) instead of leaving an old worker serving
      // stale JS until every tab is closed.
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "icons/apple-touch-icon.png"],
      manifest: {
        name: "AURELIA",
        short_name: "AURELIA",
        description: "Pricing intelligence and operations for tour operators.",
        start_url: "/",
        display: "standalone",
        background_color: "#0a0a0f",
        theme_color: "#0a0a0f",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/icons/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
          { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // Precaches the built app shell (JS/CSS/HTML) so the app still opens on a flaky
        // connection. Supabase traffic is deliberately excluded from precaching and handled
        // below instead — bookings/check-ins must never be served stale.
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff,woff2}"],
        // vite-plugin-pwa defaults navigateFallback to "index.html", which makes workbox-build's
        // generated template register its OWN cache-first NavigationRoute — and it registers that
        // BEFORE any runtimeCaching entries below, so it would silently win over a custom
        // navigation rule no matter what (confirmed by inspecting the generated dist/sw.js: the
        // default NavigationRoute appeared first in the route list even with a custom rule
        // present). Setting this to undefined here suppresses that route entirely, so the
        // NetworkFirst rule below is the ONLY thing handling navigations.
        navigateFallback: undefined,
        runtimeCaching: [
          {
            // NAVIGATIONS (loading "/", "/app/live", reopening the installed PWA, etc.) —
            // network-first so a connected device always gets the current index.html/JS bundle
            // instead of whatever was precached at the last deploy. Its own cache (cacheName
            // below) is what serves navigations when offline — populated automatically by
            // Workbox after the first successful online visit, which every real install already
            // requires (you can't install/first-load the PWA itself while offline), so this
            // covers true offline use without ever defaulting to a stale precached shell.
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: "NetworkFirst",
            options: {
              cacheName: "app-shell",
              networkTimeoutSeconds: 5,
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // REST/Auth/Storage calls to Supabase — network-first so the app always tries a
            // live request before ever touching the cache, with only a short-lived fallback
            // for true offline use. Realtime (wss://) isn't fetch-based, so the service worker
            // never intercepts those subscriptions regardless of this rule.
            urlPattern: ({ url }) => url.hostname.endsWith(".supabase.co"),
            handler: "NetworkFirst",
            options: {
              cacheName: "supabase-api",
              networkTimeoutSeconds: 10,
              expiration: { maxEntries: 50, maxAgeSeconds: 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // jsPDF (+ jspdf-autotable) and its own optional html2canvas/dompurify dependencies are
        // only ever needed for the "Download Invoice" actions (see src/lib/generateInvoice.ts,
        // now reached only via a dynamic import() at those call sites) — grouped into their own
        // chunk here so they can never end up merged back into a chunk that loads eagerly.
        manualChunks(id) {
          if (id.includes('node_modules') && (
            id.includes('jspdf') || id.includes('html2canvas') || id.includes('dompurify')
          )) {
            return 'pdf-export';
          }
        },
      },
    },
  },
}));
