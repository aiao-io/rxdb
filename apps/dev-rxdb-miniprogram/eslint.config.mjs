import baseConfig from '../../eslint.config.mjs';
import { reactFlatConfig } from '../../tools/eslint/react-flat-config.mjs';

export default [
  ...baseConfig,
  ...reactFlatConfig,
  {
    // Taro 的编译产物与小程序工程文件不是源码，进 lint 只会报无意义的解析错。
    ignores: ['dist', '.temp', '.rn_temp', 'deploy_versions', 'project.config.json', 'project.private.config.json']
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {}
  }
];
