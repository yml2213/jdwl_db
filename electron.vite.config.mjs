import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src/renderer/src', import.meta.url)),
        '@main': fileURLToPath(new URL('./src/main', import.meta.url))
      }
    },
    plugins: [vue()],
    build: {
      rollupOptions: {
        external: []
      }
    }
  }
})
