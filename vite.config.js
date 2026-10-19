import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { devApiPlugin } from './dev-server/middleware.mjs'

export default defineConfig(({ mode }) => {
  // '' prefix loads every var, not just VITE_*, so WSH_KEY stays server-side
  // only and never reaches the bundle.
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), devApiPlugin(env)],
    build: { outDir: 'dist' },
  }
})
