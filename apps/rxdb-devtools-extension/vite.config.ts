import angular from '@analogjs/vite-plugin-angular';
import { crx } from '@crxjs/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { defineConfig, type PluginOption } from 'vite';
import zip from 'vite-plugin-zip-pack';
import manifest, { DESKTOP_DEV_MODE } from './manifest.config.js';
// JSON 模块只提供 default 导出：具名导入在 Vite 的 native config loader 下会直接报错。
import pkg from './package.json' with { type: 'json' };

/**
 * dev 变体的产物目录（US-906 AC#1）。
 *
 * @remarks
 * **必须与默认产物分目录**。同目录意味着跑一次 `build-desktop-dev` 就把 `dist/` 换成了带
 * `host_permissions` 的那份，之后任何「加载已解压的扩展程序 → dist/」都会静默多带一条权限，
 * 而 manifest 的负契约是在源码上断言的、看不见产物被换掉。
 */
const DESKTOP_DEV_OUT_DIR = 'dist-desktop-dev';

export default defineConfig(({ command, mode }) => ({
  base: './',
  resolve: {
    tsconfigPaths: true,
    mainFields: ['module'],
    alias: {
      '@': `${path.resolve(import.meta.dirname, 'src')}`
    }
  },
  plugins: [
    crx({ manifest }) as PluginOption,
    angular({
      jit: false,
      tsconfig: path.resolve(import.meta.dirname, 'tsconfig.app.json'),
      transformFilter: (_code: string, id: string) => {
        // crxjs 的 `?script` / `?iife` 会被解析成 `<file>.ts?scriptId=xxx` 虚拟模块，
        // 其内容是 crxjs 生成的 `export default "<fileName>"`。analog 的 transform
        // 只按 `.ts` 后缀过滤、且会剥掉 query 后按真实源码重编译，default 导出会被丢掉
        // （同 analog 对 `?raw` 的处理）。必须在两种 command 下都跳过。
        if (/[?&](script|iife|scriptId)\b/.test(id)) return false;
        // serve 模式用 JIT（esbuild），其余文件都能正确转译
        if (command === 'serve') return true;
        // build 模式用 AOT，排除非 Angular 的纯 TS 文件（否则 AOT 会产出空 chunk）
        const normalizedId = id.replace(/\\/g, '/');
        if (normalizedId.includes('/src/content/')) return false;
        if (normalizedId.includes('/src/background/')) return false;
        if (normalizedId.includes('/rxdb-devtools-panel/wire/')) return false;
        if (normalizedId.includes('devtools-init')) return false;
        return true;
      }
    }),
    tailwindcss(),
    // dev 变体**不打 zip**：zip 是分发形态，而这份产物带着一条只对本机 localhost 成立的
    // 静态权限。让它落进 `release/` 只会造出一个长得像可分发物、却不该分发的东西。
    ...(mode === DESKTOP_DEV_MODE ?
      []
    : [zip({ outDir: 'release', outFileName: `crx-${pkg.name}-${pkg.version}.zip` }) as PluginOption])
  ],
  publicDir: 'public',
  server: {
    cors: {
      origin: [/chrome-extension:\/\//]
    },
    // serve 时启用 HMR，build 时禁用
    hmr: command === 'serve'
  },
  build: {
    ...(mode === DESKTOP_DEV_MODE ? { outDir: DESKTOP_DEV_OUT_DIR } : {}),
    emptyOutDir: true,
    // Panel entry intentionally bundles Angular runtime + @aiao/rxdb-devtools +
    // shell UI in a single chunk because Chrome MV3 enforces sandbox isolation
    // across the four contexts (background / content / devtools / panel) and
    // forbids cross-context chunk sharing. With `manualChunks: undefined`
    // the panel chunk is ~280 KB minified; the default 500 KB warning
    // threshold is therefore too aggressive here.
    chunkSizeWarningLimit: 1024,
    rolldownOptions: {
      input: {
        devtools: path.resolve(import.meta.dirname, 'devtools.html'),
        panel: path.resolve(import.meta.dirname, 'panel.html')
      },
      output: {
        manualChunks: undefined
      }
    }
  }
}));
