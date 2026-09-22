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
        runtimeCaching: [
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
}));
