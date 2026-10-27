import baseConfig from '../../eslint.config.mjs';

export default [
  ...baseConfig,
  {
    files: ['**/*.json'],
    rules: {
      '@nx/dependency-checks': [
        'error',
        {
          ignoredFiles: [
            '{projectRoot}/eslint.config.{js,cjs,mjs,ts,cts,mts}',
            '{projectRoot}/vite.config.{js,ts,mjs,mts}'
          ],
          // wasm 二进制只经字符串常量 SUBFRAME_WASM_SUBPATH 取，import 图里看不到，运行时确实依赖
          ignoredDependencies: ['wa-sqlite', '@subframe7536/sqlite-wasm']
        }
      ]
    },
    languageOptions: {
      parser: await import('jsonc-eslint-parser')
    }
  },
  {
    // 支付宝 Worker 脚本跳过平台转译、按 ES5 语法检查，只能手写 ES5（见脚本头注释）
    files: ['src/workers/*.js'],
    languageOptions: {
      ecmaVersion: 5,
      sourceType: 'script',
      globals: { worker: 'readonly', crypto: 'readonly', Uint8Array: 'readonly' }
    },
    rules: {
      'no-var': 'off'
    }
  },
  {
    // 上游 Emscripten glue 的固化副本：逐字节保持上游 + 补丁，不按仓库风格 lint。
    // 根配置里的 workspace 相对路径在 nx 以包目录为 cwd 时匹配不上，这里再声明一次。
    ignores: ['**/assets/**', '**/out-tsc', 'src/vendor/**']
  }
];
