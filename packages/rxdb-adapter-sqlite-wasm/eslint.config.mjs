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
          // SWM-003：comlink 由**消费者的 Worker 文件**直接 import（README 的 OPFS 主路径要求
          // `expose(new SqliteClient())`），本包自身走 sqlite-core 的 `wrapWithComlink`，
          // 源码里确实不 import 它 —— 但严格 pnpm 下消费者拿不到 core 的传递依赖，
          // 因此必须声明为可选 peer。这条规则只看本包源码，无法表达该消费者契约。
          ignoredDependencies: ['comlink']
        }
      ]
    },
    languageOptions: {
      parser: await import('jsonc-eslint-parser')
    }
  }
];
