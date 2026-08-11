import nx from '@nx/eslint-plugin';
import baseConfig from '../../eslint.config.mjs';

export default [
  ...baseConfig,
  ...nx.configs['flat/angular'],
  ...nx.configs['flat/angular-template'],
  {
    ignores: ['dist/**', 'dist-debug/**', 'release/**']
  },
  {
    files: ['**/*.ts'],
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        {
          type: 'attribute',
          prefix: 'app',
          style: 'camelCase'
        }
      ],
      '@angular-eslint/component-selector': [
        'error',
        {
          type: 'element',
          prefix: 'app',
          style: 'kebab-case'
        }
      ],
      // Disable member-ordering for now - can be fixed in a follow-up
      '@typescript-eslint/member-ordering': 'off',
      // Disable prefer-inject for now - requires migration
      '@angular-eslint/prefer-inject': 'off',
      // Disable no-output-native for now
      '@angular-eslint/no-output-native': 'warn'
    }
  },
  {
    files: ['**/*.html'],
    // Override or add rules here
    rules: {
      // Disable template accessibility rules for inline templates
      '@angular-eslint/template/click-events-have-key-events': 'error',
      '@angular-eslint/template/interactive-supports-focus': 'error',
      '@angular-eslint/template/label-has-associated-control': 'error'
    }
  }
];
