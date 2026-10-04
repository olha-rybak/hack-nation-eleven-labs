import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  // Capture-loop tuning lives in the repo-root .env (single source with the server).
  const root = loadEnv(mode, '../..', '')
  const web = loadEnv(mode, process.cwd(), 'VITE_')
  const api = web.VITE_API_TARGET || 'http://127.0.0.1:8000'

  return {
    plugins: [react()],
    define: {
      'import.meta.env.VITE_FRAME_FPS': JSON.stringify(root.FRAME_FPS || '1'),
      'import.meta.env.VITE_FRAME_CHANGE_MIN_CELLS': JSON.stringify(root.FRAME_CHANGE_MIN_CELLS || '12'),
      'import.meta.env.VITE_OFF_THE_RECORD_WINDOW_SEC': JSON.stringify(root.OFF_THE_RECORD_WINDOW_SEC || '30'),
      'import.meta.env.VITE_MAX_LIVE_QUESTIONS': JSON.stringify(root.MAX_LIVE_QUESTIONS || '5'),
      'import.meta.env.VITE_VAD_SPEECH_THRESHOLD': JSON.stringify(root.VAD_SPEECH_THRESHOLD || '0.5'),
      'import.meta.env.VITE_VAD_RELEASE_MS': JSON.stringify(root.VAD_RELEASE_MS || '400'),
    },
    server: {
      // The mock Work Map is the T-200 fixture, read straight from the server tests.
      fs: { allow: ['.', '../server/tests/fixtures'] },
      proxy: {
        // The server has no /api prefix; strip it so /api/ingest/frame -> /ingest/frame.
        '/api': { target: api, ws: true, rewrite: (path) => path.replace(/^\/api/, '') },
      },
    },
  }
})
