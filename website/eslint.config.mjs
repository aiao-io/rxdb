import baseConfig from '../eslint.config.mjs';

export default [
  ...baseConfig,
  {
    ignores: ['.docusaurus/**', 'build/**', 'static/**', 'public/**', 'docs/**', 'blog/**']
  }
];
