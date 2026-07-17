import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const isElectronBuild = process.env.ELECTRON === '1';

export default defineConfig({
  // Electron 패키지 빌드 시 상대경로로 자산 로드
  base: isElectronBuild ? './' : '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'rarebook 서재',
        short_name: '서재',
        description: '내 책을 AI와 함께 읽고 지식을 쌓는 독서 앱',
        theme_color: '#B8440A',
        background_color: '#FAF7F2',
        display: 'standalone',
        orientation: 'any',  // 태블릿 가로/세로 모두 지원
        scope: '/',
        start_url: '/',
        icons: [
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
          { src: 'apple-touch-icon.png', sizes: '180x180', type: 'image/png', purpose: 'any' },
        ],
      },
      workbox: {
        // 앱 셸(JS·CSS·HTML)만 캐시 — PDF는 Drive에서 직접 로딩
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        // OCR 자산(Tesseract wasm/언어팩, 총 43MB+)은 precache 제외 — OCR 사용 시 로드+브라우저 캐시
        globIgnores: ['**/tesseract/**', '**/tessdata/**'],
        runtimeCaching: [
          {
            // self-host Tesseract 자산은 런타임 캐시(첫 사용 후 오프라인)
            urlPattern: /\/(tesseract|tessdata)\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'pkl-ocr', expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
        navigateFallback: 'index.html',
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/__tests__/setup.js'],
  },
})
