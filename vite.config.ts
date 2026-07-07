import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173, strictPort: true },
  build: {
    chunkSizeWarningLimit: 2600,
    rollupOptions: {
      output: {
        manualChunks: {
          globe: ['globe.gl'], // three.js rides along — keeps app-code edits from re-downloading 3D vendor
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
})
