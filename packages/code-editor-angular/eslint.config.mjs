import nx from '@nx/eslint-plugin';
import baseConfig from '../../eslint.config.mjs';

export default [
  ...baseConfig,
  {
    files: ['**/*.json'],
    rules: {
      '@nx/dependency-checks': [
        'error',
        {
          ignoredFiles: ['{projectRoot}/eslint.config.{js,cjs,mjs,ts,cts,mts}'],
          ignoredDependencies: [
            '@analogjs/vite-plugin-angular',
            '@codecov/vite-plugin',
            '@angular/common',
            '@angular/core',
            '@angular/forms',
            '@nx/vite',
            'vite',
            '@angular/platform-browser',
            'vitest',
            '@angular/compiler'
          ]
        }
      ]
    },
    languageOptions: {
      parser: await import('jsonc-eslint-parser')
    }
  },
  ...nx.configs['flat/angular'],
  ...nx.configs['flat/angular-template'],
  {
    files: ['**/*.ts'],
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        {
          type: 'attribute',
          prefix: 'ao',
          style: 'camelCase'
        }
      ],
      '@angular-eslint/component-selector': [
        'error',
        {
          type: 'element',
          prefix: 'ao',
          style: 'kebab-case'
        }
      ]
    }
  },
  {
    files: ['**/*.html'],
    // Override or add rules here
    rules: {}
  }
];
