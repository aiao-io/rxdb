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
          ignoredDependencies: ['wa-sqlite']
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
    ignores: ['**/assets/**', '**/out-tsc']
  }
];
