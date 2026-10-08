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
          // 不被 import：@tarojs/cli 是加载本插件的宿主
          ignoredDependencies: ['@tarojs/cli']
        }
      ]
    },
    languageOptions: {
      parser: await import('jsonc-eslint-parser')
    }
  }
];
