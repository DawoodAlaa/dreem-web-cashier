import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  build: {
    target: 'es2020',
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks: { vendor: ['react', 'react-dom', 'zustand'], supabase: ['@supabase/supabase-js'] },
      },
    },
  },
  server: { port: 5173, host: true },
})
