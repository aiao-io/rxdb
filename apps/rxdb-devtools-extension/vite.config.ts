import angular from '@analogjs/vite-plugin-angular';
import { crx } from '@crxjs/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { defineConfig, type PluginOption } from 'vite';
import zip from 'vite-plugin-zip-pack';
import manifest from './manifest.config.js';
// JSON 模块只提供 default 导出：具名导入在 Vite 的 native config loader 下会直接报错。
import pkg from './package.json' with { type: 'json' };

export default defineConfig(({ command }) => ({
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
    zip({ outDir: 'release', outFileName: `crx-${pkg.name}-${pkg.version}.zip` }) as PluginOption
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
