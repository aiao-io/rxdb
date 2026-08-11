import nx from '@nx/eslint-plugin';

export default [
  {
    files: ['**/*.json'],
    // Override or add rules here
    rules: {},
    languageOptions: {
      parser: await import('jsonc-eslint-parser')
    }
  },
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    ignores: [
      '**/node_modules',
      '**/dist',
      '**/out-tsc',
      '**/coverage',
      '**/tmp',
      '**/*.min.js',
      '**/vite.config.*.timestamp*',
      '**/vitest.config.*.timestamp*',
      '**/test-output',
      '**/playwright-report',
      '**/build',
      '**/.react-router'
    ]
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.vue'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'warn',
        {
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
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.cts', '**/*.mts', '**/*.js', '**/*.jsx', '**/*.cjs', '**/*.mjs'],
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-member-accessibility': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-inferrable-types': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-parameter-properties': 'off',
      '@typescript-eslint/member-ordering': [
        'error',
        {
          default: [
            /**
             *  1，按照变量，构造函数，方法排序
             *  2，距离构造函数越近越开放
             */
            'signature',
            'readonly-signature',
            [
              '#private-static-field',
              '#private-static-readonly-field',
              '#private-instance-field',
              '#private-instance-readonly-field',
              '#private-field',
              '#private-readonly-field'
            ],
            [
              '#private-static-set',
              '#private-instance-set',
              '#private-static-get',
              '#private-instance-get',
              '#private-get'
            ],
            [
              'private-static-field',
              'private-static-readonly-field',
              'private-decorated-field',
              'private-decorated-readonly-field',
              'private-instance-field',
              'private-instance-readonly-field',
              'private-field',
              'private-readonly-field'
            ],
            [
              'private-static-get',
              'private-decorated-get',
              'private-instance-get',
              'private-get',
              'private-static-set',
              'private-decorated-set',
              'private-instance-set',
              'private-set'
            ],
            [
              'protected-static-field',
              'protected-static-readonly-field',
              'protected-decorated-field',
              'protected-decorated-readonly-field',
              'protected-instance-field',
              'protected-instance-readonly-field',
              'protected-abstract-field',
              'protected-abstract-readonly-field',
              'protected-field',
              'protected-readonly-field'
            ],
            [
              'protected-static-get',
              'protected-decorated-get',
              'protected-instance-get',
              'protected-abstract-get',
              'protected-get',
              'protected-static-set',
              'protected-decorated-set',
              'protected-instance-set',
              'protected-abstract-set',
              'protected-set'
            ],
            [
              'public-static-field',
              'public-static-readonly-field',
              'public-decorated-field',
              'public-decorated-readonly-field',
              'public-instance-field',
              'public-instance-readonly-field',
              'public-abstract-field',
              'public-abstract-readonly-field',
              'public-field',
              'public-readonly-field'
            ],
            [
              'public-static-get',
              'public-decorated-get',
              'public-instance-get',
              'public-abstract-get',
              'public-get',
              'public-static-set',
              'public-decorated-set',
              'public-instance-set',
              'public-abstract-set',
              'public-set'
            ],
            ['static-field', 'static-readonly-field'],
            ['static-get', 'static-set'],
            ['instance-readonly-field', 'instance-field'],
            ['instance-get', 'instance-set'],
            ['abstract-readonly-field', 'abstract-field'],
            ['abstract-get', 'abstract-set'],
            ['decorated-field', 'decorated-readonly-field'],
            ['decorated-get', 'decorated-set'],
            ['field', 'readonly-field'],
            ['get', 'set'],
            ['static-initialization', 'public-constructor', 'protected-constructor', 'private-constructor'],
            ['public-static-method', 'public-decorated-method', 'public-instance-method', 'public-abstract-method'],
            ['protected-static-method', 'protected-decorated-method', 'protected-instance-method'],
            ['private-static-method', 'private-decorated-method', 'private-instance-method'],
            ['#private-static-method', '#private-instance-method']
          ]
        }
      ]
    }
  }
];
