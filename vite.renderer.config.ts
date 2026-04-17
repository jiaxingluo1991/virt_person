import { defineConfig } from 'vite'
import { resolve } from 'path'
import { copyFileSync, mkdirSync } from 'fs'

export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  base: './',
  build: {
    outDir: resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true
  },
  plugins: [
    {
      name: 'copy-cubism-core',
      closeBundle() {
        const dest = resolve(__dirname, 'dist/renderer/cubism-core')
        mkdirSync(dest, { recursive: true })
        copyFileSync(
          resolve(__dirname, 'resources/cubism-core/live2dcubismcore.min.js'),
          resolve(dest, 'live2dcubismcore.min.js')
        )
      }
    }
  ]
})
