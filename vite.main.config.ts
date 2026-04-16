import { defineConfig } from 'vite'
import { resolve } from 'path'

const external = ['electron', 'ffmpeg-static', 'fs', 'path', 'child_process', 'os', 'util', 'http', 'https', 'url', 'stream', 'buffer', 'crypto', 'events', 'net', 'tls', 'zlib']

export default defineConfig({
  build: {
    outDir: 'dist/main',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'src/main/index.ts'),
        preload: resolve(__dirname, 'src/main/preload.ts')
      },
      output: {
        format: 'cjs',
        entryFileNames: '[name].js'
      },
      external
    }
  }
})
