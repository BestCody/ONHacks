import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const projectRoot = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  // The exported project keeps its source files at the repository root.
  // These aliases preserve the existing imports without a noisy file move.
  resolve: {
    alias: [
      { find: /^@\/components\/ui\//, replacement: `${projectRoot}/` },
      { find: /^@\/components\//, replacement: `${projectRoot}/` },
      { find: /^@\/pages\//, replacement: `${projectRoot}/` },
      { find: /^@\/lib\//, replacement: `${projectRoot}/` },
      { find: /^@\/hooks\//, replacement: `${projectRoot}/` },
      { find: /^@\//, replacement: `${projectRoot}/` },
    ],
  },
  server: {
    proxy: {
      '/api': 'http://localhost:10000',
    },
  },
})
