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
            // public-contract 是「以消费者视角」验证发布面的契约文件，
            // 故意 self-import 本包子路径，不属于真实依赖图。
            '{projectRoot}/public-contract/**'
          ]
        }
      ]
    },
    languageOptions: {
      parser: await import('jsonc-eslint-parser')
    }
  },
  {
    files: ['public-contract/**/*.ts'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          allowCircularSelfDependency: true,
          enforceBuildableLibDependency: true,
          allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$'],
          depConstraints: [
            {
              sourceTag: '*',
              onlyDependOnLibsWithTags: ['*']
            }
          ]
        }
      ]
    }
  }
];
