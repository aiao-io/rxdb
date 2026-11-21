import nx from '@nx/eslint-plugin';
import baseConfig from '../../../eslint.config.mjs';

export default [
  ...baseConfig,
  ...nx.configs['flat/angular'],
  ...nx.configs['flat/angular-template'],
  { ignores: ['public/**', 'src-tauri/target/**', 'src-tauri/gen/**', 'desktop-dist/**'] }
];
