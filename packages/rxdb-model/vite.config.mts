/// <reference types='vitest' />
import { codecovVitePlugin } from '@codecov/vite-plugin';
import path from 'node:path';
import { defineConfig, transformWithEsbuild } from 'vite';
import dts from 'vite-plugin-dts';

const legacyDecoratorRE = /(?:^|\n)\s*@[A-Za-z_$][\w$]*(?:\s*\(|\s*\n|\s*$)/;

// @aiao/rxdb 源码（经 tsconfig paths 直接链接）含实验性装饰器，需经 esbuild 转换后
// 才能被 vitest 加载；vite 原生 oxc 转换不支持该语法。
const legacyDecoratorTransform = () => ({
  name: 'legacy-decorator-transform',
  enforce: 'pre' as const,
  async transform(code: string, id: string) {
    const file = id.split('?', 1)[0];
    if (!file.endsWith('.ts') || !legacyDecoratorRE.test(code)) return null;
    const result = await transformWithEsbuild(code, file, {
      loader: 'ts',
      format: 'esm',
      sourcemap: true,
      target: 'es2022',
      tsconfigRaw: {
        compilerOptions: {
          experimentalDecorators: true
        }
      }
    });
    return {
      code: result.code,
      map: result.map
    };
  }
});

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/packages/rxdb-model',
  plugins: [
    legacyDecoratorTransform(),
    dts({
      entryRoot: 'src',
      pathsToAliases: false,
      tsconfigPath: path.join(import.meta.dirname, 'tsconfig.lib.json')
    }),
    ...(process.env.CI === 'true' && process.env.CODECOV_TOKEN ?
      [
        codecovVitePlugin({
          enableBundleAnalysis: true,
          telemetry: false,
          bundleName: 'rxdb-model',
          uploadToken: process.env.CODECOV_TOKEN
        })
      ]
    : [])
  ],
  build: {
    outDir: './dist',
    emptyOutDir: true,
    reportCompressedSize: true,
    sourcemap: false,
    lib: {
      entry: 'src/index.ts',
      name: '@aiao/rxdb-model',
      fileName: 'index',
      formats: ['es' as const]
    },
    rolldownOptions: {
      // dts 插件生成声明文件天然比 Rolldown 原生链接阶段慢，抑制误报的 PLUGIN_TIMINGS 警告
      checks: { pluginTimings: false },
      external: ['@aiao/rxdb', 'rxjs', 'rxjs/operators', /^@visactor\//],
      input: {
        index: 'src/index.ts'
      },
      output: {
        entryFileNames: chunkInfo => `${chunkInfo.name}.js`
      }
    }
  },
  resolve: {
    tsconfigPaths: true,
    conditions: ['@aiao/source']
  },
  optimizeDeps: {
    include: ['uuid']
  },
  test: {
    name: 'rxdb-model',
    watch: false,
    globals: true,
    // 默认 node 环境；DOM 依赖的 spec 通过文件头 `// @vitest-environment happy-dom` 切换。
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default', 'junit'],
    outputFile: {
      junit: '../../coverage/packages/rxdb-model/junit.xml'
    },
    coverage: {
      reportsDirectory: '../../coverage/packages/rxdb-model',
      provider: 'v8' as const,
      reporter: ['text', 'json', 'json-summary', 'clover', 'lcovonly', 'html']
    }
  },
  define: {
    'import.meta.vitest': false
  }
}));
