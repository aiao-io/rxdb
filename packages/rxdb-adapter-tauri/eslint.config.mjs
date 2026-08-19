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
          ignoredDependencies: ['@aiao/rxdb-test', 'rxjs']
        }
      ]
    },
    languageOptions: {
      parser: await import('jsonc-eslint-parser')
    }
  }
];
