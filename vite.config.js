import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('firebase')) return 'vendor-firebase';
            if (id.includes('react')) return 'vendor-react';
            if (id.includes('jspdf') || id.includes('html2canvas')) return 'vendor-pdf';
            return 'vendor';
          }
          if (id.includes('/src/pages/accounting/')) return 'accounting';
          if (id.includes('/src/pages/admin/')) return 'admin';
          if (id.includes('/src/pages/store/')) return 'store';
        },
      },
    },
    chunkSizeWarningLimit: 1200,
  },
})
