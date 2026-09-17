import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  logLevel: 'error',
  plugins: [react()],
  publicDir: 'public',
  resolve: {
    alias: {
      '@': resolve('./src'),
    },
  },
  build: {
    // 'esnext' hiess: gar kein Downleveling. Damit landete moderne Syntax
    // (private Klassenfelder aus @tanstack/react-query, logische Zuweisungen)
    // unverändert im Bundle, obwohl capacitor.config.json WebView 90 zulässt
    // und die Web-App auf iPhones ab iOS 14 läuft — dort scheitert schon das
    // Parsen des Chunks und die App zeigt nur einen weissen Screen.
    // Die Ziele decken den ältesten unterstützten Android-WebView (90) und
    // Safari 14 ab; ES2020 sichert Firefox/Edge mit ab.
    target: ['es2020', 'chrome90', 'safari14', 'edge90', 'firefox90'],
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
      },
    },
    rollupOptions: {
      output: {
        // Schwere, selten geänderte Bibliotheken in eigene Chunks auslagern.
        // Libs, die nur in lazy-geladenen Seiten verwendet werden (three, leaflet,
        // recharts, jspdf, html2canvas), bleiben dadurch eigene Lazy-Chunks und
        // landen nicht im initialen Bundle – das beschleunigt den ersten Start
        // und verbessert das Langzeit-Caching (stabile Hashes pro Lib-Gruppe).
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('/react-dom/') || id.includes('/react-router') || /\/react\//.test(id)) {
            return 'react-vendor';
          }
          if (id.includes('/three/')) return 'three';
          if (id.includes('leaflet')) return 'leaflet';
          if (id.includes('recharts') || id.includes('/d3-') || id.includes('/victory-')) return 'charts';
          if (id.includes('jspdf') || id.includes('html2canvas')) return 'pdf';
          if (id.includes('framer-motion')) return 'framer';
          if (id.includes('@radix-ui')) return 'radix';
        },
      },
    },
    chunkSizeWarningLimit: 1000,
    sourcemap: false,
    reportCompressedSize: false,
  },
  server: {
    headers: {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'SAMEORIGIN',
      'X-XSS-Protection': '1; mode=block',
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
