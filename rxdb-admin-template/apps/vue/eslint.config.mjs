import skipFormatting from '@vue/eslint-config-prettier/skip-formatting';
import vue from 'eslint-plugin-vue';
import baseConfig from '../../../eslint.config.mjs';

export default [
  ...baseConfig,
  ...vue.configs['flat/recommended'],
  // 缩进 / 换行 / 自闭合这类纯格式规则由 prettier 独占（VUE-FRESH-02）；
  // `vue/attributes-order` 保留：.prettierrc 对 *.vue 已关闭属性排序（RV-035），语义顺序只由 ESLint 约束
  skipFormatting,
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: await import('@typescript-eslint/parser')
      }
    }
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.vue'],
    rules: {
      'vue/multi-word-component-names': 'off',
      'vue/singleline-html-element-content-newline': 'off'
    }
  }
];
