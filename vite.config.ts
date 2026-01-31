import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // We'll register manually in `src/index.tsx`
      injectRegister: null,
      // We show our own "reload to update" prompt in `src/index.tsx`.
      registerType: 'prompt',
      filename: 'sw.js',
      manifestFilename: 'manifest.webmanifest',
      includeAssets: [
        'pwa-192x192.png',
        'pwa-512x512.png',
        'apple-touch-icon.png',
      ],
      manifest: {
        name: 'Expense Tracker',
        short_name: 'Expense',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#0b1220',
        theme_color: '#0b1220',
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        // Workbox defaults to `mode: 'production'` which minifies the generated
        // service worker. Some Node/tooling combos can choke on that minify step;
        // `development` keeps the SW unminified but fully functional.
        mode: 'development',
        sourcemap: false,
        // SPA offline fallback; never treat API endpoints as navigations.
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Split vendor libraries into separate chunks
          'react-vendor': ['react', 'react-dom'],
          'recharts-vendor': ['recharts'],
          'supabase-vendor': ['@supabase/supabase-js'],
        },
      },
    },
    chunkSizeWarningLimit: 600, // Increase limit slightly, but we're splitting chunks now
  },
})