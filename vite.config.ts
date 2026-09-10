import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Paksa impor langsung ke bundle ESM Excawdraw, melewati wrapper
      // main.js yang memakai process.env.IS_PREACT (tidak ada di browser,
      // dan `define` Vite tidak diterapkan pada dep pre-bundled CJS ini).
      '@excalidraw/excalidraw': path.resolve(
        __dirname, 'node_modules/@excalidraw/excalidraw/dist/excalidraw.production.min.js',
      ),
    },
  },
  server: { port: 5173, host: true },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          xlsx: ['xlsx'],
        },
      },
    },
  },
})
