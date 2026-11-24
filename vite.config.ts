import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { port: 5173, host: true },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        // 자주 바뀌지 않는 라이브러리는 따로 묶어 캐시가 오래 가게 한다.
        manualChunks(id) {
          if (/node_modules[\/](react|react-dom|scheduler|react-router)[\/]/.test(id)) return 'react'
          if (/node_modules[\/]@supabase[\/]/.test(id)) return 'supabase'
          return undefined
        },
      },
    },
  },
})
