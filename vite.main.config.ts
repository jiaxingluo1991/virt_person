import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/main/index.ts'),
      formats: ['cjs'],
      fileName: () => 'index.js'
    },
    outDir: 'dist/main',
    rollupOptions: {
      external: ['electron', 'ffmpeg-static', 'fs', 'path', 'child_process', 'os', 'http', 'https', 'url', 'stream', 'buffer']
    }
  }
})
