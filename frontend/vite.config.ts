import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'service-worker.ts',
      injectRegister: false,
      includeAssets: [
        'manifest.json',
        'fieldMap.json',
        'forms/annapurna-form.pdf',
        'icons/icon-192.png',
        'icons/icon-512.png',
        'tesseract/worker.min.js',
        'tessdata/eng.traineddata.gz',
        'tessdata/ben.traineddata.gz'
      ],
      injectManifest: {
        globPatterns: ['**/*.{html,js,css,png,svg,json,pdf,gz,wasm}'],
        maximumFileSizeToCacheInBytes: 30 * 1024 * 1024
      },
      devOptions: {
        enabled: true,
        type: 'module'
      }
    })
  ]
});
