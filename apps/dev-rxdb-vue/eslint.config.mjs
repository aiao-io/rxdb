import skipFormatting from '@vue/eslint-config-prettier/skip-formatting';
import vue from 'eslint-plugin-vue';
import baseConfig from '../../eslint.config.mjs';

export default [
  ...baseConfig,
  ...vue.configs['flat/recommended'],
  // VUE-FRESH-02：关掉与 prettier 冲突的 Vue 模板风格规则。
  //
  // 这些规则与本仓的 prettier 配置**根本冲突**，不是「存量格式债」：
  // `.prettierrc` 启用了 `prettier-plugin-organize-attributes` + `attributeSort: 'ASC'`
  // （属性按字母序排），而 `vue/attributes-order` 要求的是 Vue 的**语义顺序**
  // （DEFINITION → LIST_RENDERING → CONDITIONALS → … → EVENTS → CONTENT）。
  // 实测 `eslint --fix` 能把 650 条清零，但紧接着 `nx format:write` 会原样退回 ——
  // 两者不收敛，机械修复无法收口。
  //
  // 既然 prettier 是本仓的格式化事实源（`nx format:write` 是既定流程），
  // 就由它独占模板格式，ESLint 只管语义规则。
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
      'vue/singleline-html-element-content-newline': 'off',
      // VUE-FRESH-02：属性顺序由 prettier 独占。
      // `skip-formatting` 只关掉缩进/换行/自闭合这类**纯格式**规则，不含 `attributes-order`——
      // 因为在多数仓库里 prettier 不动属性顺序。但本仓的 `.prettierrc` 启用了
      // `prettier-plugin-organize-attributes` + `attributeSort: 'ASC'`（按字母序排），
      // 与本规则要求的 Vue **语义顺序**直接冲突，实测 `eslint --fix` 与 `nx format:write`
      // 会无限互相回退。留着它等于永久 558 条无法消除的 warning。
      'vue/attributes-order': 'off'
    }
  }
];
