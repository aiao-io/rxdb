import nx from '@nx/eslint-plugin';
import baseConfig from '../../eslint.config.mjs';

export default [
  ...baseConfig,
  // Local esbuild output is generated, not hand-authored application code.
  { ignores: ['public/prompt-runtime/**', 'desktop-dist/**', 'src-tauri/target/**', 'src-tauri/gen/**'] },
  ...nx.configs['flat/angular'],
  ...nx.configs['flat/angular-template'],
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
      ]
    }
  },
  {
    files: ['**/*.html'],
    // Override or add rules here
    rules: {}
  }
];
