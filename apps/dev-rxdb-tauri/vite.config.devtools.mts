import angular from '@analogjs/vite-plugin-angular';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { defineConfig } from 'vite';

/**
 * Tauri 面板的独立 vite build（US-905 阶段 1）。
 *
 * @remarks
 * 主 app 走 `@angular/build:application`（单入口），而 `rxdb-devtools` 窗口要加载第二份
 * Angular 入口（共享 panel）。这份配置用 `@analogjs/vite-plugin-angular` 单独把 `devtools.html`
 * 打成一份产物，与 `apps/rxdb-devtools-extension` 的 vite build 同构——只是没有 crx，
 * 也没有 Chrome 的 `chrome.devtools.panels.create`（Tauri 没有这个 API，`devtools.html` 直接
 * 引导面板）。
 */
export default defineConfig({
  base: './',
  resolve: {
    tsconfigPaths: true,
    mainFields: ['module']
  },
  plugins: [
    // 面板的样式全靠 Tailwind + daisyUI；缺了它整个窗口是无样式的（见 src/devtools/devtools.css）。
    tailwindcss(),
    angular({
      jit: false,
      tsconfig: path.resolve(import.meta.dirname, 'tsconfig.app.json')
    })
  ],
  publicDir: false,
  build: {
    emptyOutDir: true,
    // 直接打进主 app 的 frontendDist 的 `devtools/` 子目录：`rxdb-devtools` 窗口据此
    // 用 `WebviewUrl::App("devtools/devtools.html")` 加载，且不跟主 app 的 `assets/` 抢目录。
    outDir: path.resolve(import.meta.dirname, '../../dist/apps/dev-rxdb-tauri/browser/devtools'),
    chunkSizeWarningLimit: 1024,
    rolldownOptions: {
      input: {
        devtools: path.resolve(import.meta.dirname, 'devtools.html')
      }
    }
  }
});
