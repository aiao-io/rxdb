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
    // 打在主 app 产物**之外**，再由 `build` 的 assets 拷进 `browser/devtools/`——`rxdb-devtools`
    // 窗口据此用 `WebviewUrl::App("devtools/devtools.html")` 加载，且不跟主 app 的 `assets/` 抢目录。
    //
    // 为什么不直接写进 `dist/apps/dev-rxdb-tauri/browser/devtools`（原先的做法）：那让本产物成为
    // `build` outputs 的**子目录**，两个 target 抢同一棵树；而且 `tauri dev` 取前端走的是
    // `nx serve` 的 dev server，它只服务 build 的产物与 assets，磁盘上的 `dist/` 一个字节都不给——
    // 面板必须经 assets 进 build，两条取前端的路径才共用同一份拷贝。见 `build-config.spec.ts`。
    //
    // 路径也刻意不叫 `dist/apps/dev-rxdb-tauri-devtools`：那与 build 的 `dist/apps/dev-rxdb-tauri`
    // 互为字符串前缀，任何按前缀判目录归属的地方都会踩空。
    outDir: path.resolve(import.meta.dirname, '../../dist/devtools/dev-rxdb-tauri'),
    chunkSizeWarningLimit: 1024,
    rolldownOptions: {
      input: {
        devtools: path.resolve(import.meta.dirname, 'devtools.html')
      }
    }
  }
});
