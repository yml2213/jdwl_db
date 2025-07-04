// electron.vite.config.mjs
import { resolve } from "path";
import { fileURLToPath } from "url";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import vue from "@vitejs/plugin-vue";
var __electron_vite_injected_import_meta_url = "file:///Users/yml/yml/projects/jdwl_db1/electron-app/electron.vite.config.mjs";
var __dirname = fileURLToPath(new URL(".", __electron_vite_injected_import_meta_url));
var electron_vite_config_default = defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        "@": resolve(__dirname, "src/renderer/src")
      }
    },
    plugins: [vue()]
  }
});
export {
  electron_vite_config_default as default
};
