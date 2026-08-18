import baseConfig from '../../eslint.config.mjs';

export default [
  { ignores: ['out-tsc/**'] },
  ...baseConfig,
  {
    files: ['**/*.ts', '**/*.js'],
    // Override or add rules here
    rules: {}
  }
];
