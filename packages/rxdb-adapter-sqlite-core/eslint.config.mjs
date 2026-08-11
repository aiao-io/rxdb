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
            // coverage-acceptance 的配置与 runner 是**只在本地/CI 跑门禁时执行**的开发工具，
            // 既不进 dist 也不进 npm 包（package.json 的 files 只发 dist + src）。
            // 它们引的 @vitest/browser-playwright / playwright 归工作区根 devDependencies 管，
            // 与 vite.config.mts 同类，所以走同一条 ignoredFiles 而不是塞进本包 dependencies。
            '{projectRoot}/vitest.coverage-acceptance.config.{js,ts,mjs,mts}',
            '{projectRoot}/scripts/*.{js,cjs,mjs,ts,cts,mts}'
          ],
          ignoredDependencies: ['type-fest', '@aiao/rxdb-test']
        }
      ]
    },
    languageOptions: {
      parser: await import('jsonc-eslint-parser')
    }
  }
];
