import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    // The mock Work Map is the T-200 fixture, read straight from the server tests.
    fs: { allow: ['.', '../server/tests/fixtures'] },
    proxy: {
      '/api': { target: 'http://127.0.0.1:8000', ws: true },
    },
  },
})
