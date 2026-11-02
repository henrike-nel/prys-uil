import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

const base = '/prys-uil/';

export default defineConfig({
  base,
  plugins: [
    svelte(),
    // Precaches the app shell only; data always comes from GitHub.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        name: 'PrysUil',
        short_name: 'PrysUil',
        display: 'standalone',
        // Mirror --color-green and --color-cream from the brand tokens.
        theme_color: '#ABC270',
        background_color: '#FBFAEE',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: 'icon-maskable-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: 'icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        share_target: { action: base, method: 'GET', params: { url: 'url', text: 'text' } },
      },
    }),
  ],
  test: { environment: 'node', include: ['test/**/*.test.ts'] },
});
