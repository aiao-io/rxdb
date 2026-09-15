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
            '{projectRoot}/vite.config.{js,ts,mjs,mts}',
            // US-210 T4：一致性套件的 vitest 配置随套件一起搬进本包。它只在跑门禁时执行，
            // 既不进 dist 也不进 npm 包（`files` 只发 dist + src），引的 vitest 归工作区根
            // devDependencies 管——与 vite.config.mts 同类，所以走 ignoredFiles 而不是把
            // vitest 塞进本包 dependencies（那会让每个装本包的用户都拖一份测试框架）。
            '{projectRoot}/vitest.conformance.{js,ts,mjs,mts}'
          ],
          // 两个都只被 `conformance/` 用，而 `conformance/` 不在 `files` 里（只发 dist + src），
          // 装本包的用户永远拿不到这两条 import。
          // `@aiao/rxdb-plugin-history`：US-025 阶段 C 之后加密契约套件读的
          // `adapter.rxdb.versionManager` 随历史插件走，工厂得先 `use()` 它 —— 这是**套件**的
          // 依赖，不是适配器的。真放进 dependencies，每个装 tauri 适配器的人都会被迫拖一份
          // 历史插件，而适配器本身一行都没用到它。
          ignoredDependencies: ['@aiao/rxdb-test', '@aiao/rxdb-plugin-history']
        }
      ]
    },
    languageOptions: {
      parser: await import('jsonc-eslint-parser')
    }
  }
];
