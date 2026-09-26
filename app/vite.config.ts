import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages serves the site from /<repo>/ — build with BASE_PATH=/<repo>/ npm run build
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  plugins: [
    react(),
    // Offline: the app shell, fonts, icons and cards.json are precached; scans are cached as
    // they are viewed (cache-first, up to 3000 files / 60 days).
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Странствия в Средиземье — база карт',
        short_name: 'Странствия',
        description: 'Фанатская база карт «Властелин Колец: Странствия в Средиземье» с поиском, фильтрами и планировщиком колоды.',
        lang: 'ru',
        display: 'standalone',
        background_color: '#14120f',
        theme_color: '#14120f',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}', 'data/cards.json'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => /\/(img|thumb)\//.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'scans',
              expiration: { maxEntries: 3000, maxAgeSeconds: 60 * 24 * 3600 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  base,
  build: { outDir: 'dist', emptyOutDir: true },
});
