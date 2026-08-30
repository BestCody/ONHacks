import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const projectRoot = path.dirname(fileURLToPath(import.meta.url))
const sourceDirectory = path.join(projectRoot, 'src')

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': sourceDirectory,
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:10000',
    },
  },
})
