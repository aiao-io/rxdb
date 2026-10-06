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
          // 两者都不被 import：adapter 按 app 根动态解析（wasm、Worker），@tarojs/cli 是加载本插件的宿主
          ignoredDependencies: ['@aiao/rxdb-adapter-miniprogram', '@tarojs/cli']
        }
      ]
    },
    languageOptions: {
      parser: await import('jsonc-eslint-parser')
    }
  }
];
