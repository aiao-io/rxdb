import tsParser from '@typescript-eslint/parser';
import skipFormatting from '@vue/eslint-config-prettier/skip-formatting';
import vue from 'eslint-plugin-vue';
import baseConfig from '../../eslint.config.mjs';

export default [
  ...baseConfig,
  ...vue.configs['flat/recommended'],
  // 缩进 / 换行 / 自闭合这类纯格式规则由 prettier 独占（同 apps/dev-rxdb-vue 的 VUE-FRESH-02）；
  // `vue/attributes-order` 保留：.prettierrc 对 *.vue 已关闭属性排序，语义顺序只由 ESLint 约束
  skipFormatting,
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: tsParser
      }
    }
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.vue'],
    rules: {
      'vue/multi-word-component-names': 'off'
    }
  },
  {
    // 规约针对的是 SFC 组织方式；测试里的宿主组件是一次性夹具，
    // 一个用例一个宿主远比拆成一堆 .vue 文件清楚
    files: ['**/__tests__/**/*.ts', '**/*.spec.ts'],
    rules: {
      'vue/one-component-per-file': 'off'
    }
  }
];
