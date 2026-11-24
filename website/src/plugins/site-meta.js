/**
 * 按当前 locale 注入站点 meta description，替代 docusaurus.config.ts 里静态的中文
 * themeConfig.metadata 条目：静态元数据会被原样注入每个 locale 的页面，导致英文页泄漏中文描述。
 *
 * 文案与 website/src/lib/locale-copy.ts 中 englishCopy 的措辞一致；locale-copy.ts 顶层依赖
 * @docusaurus/useDocusaurusContext（webpack 别名）与 react，无法在 Node 侧的插件里引入，
 * 因此这里内联 zh/en 两段描述。zh 文案与移除的静态条目逐字节一致。
 */
const DESCRIPTIONS = {
  'zh-Hans': 'RxDB 为 Angular、React、Vue 提供浏览器内数据库、响应式查询与类型安全的统一实体模型。',
  en: 'RxDB provides Angular, React, and Vue with an in-browser database, reactive queries, and a type-safe unified entity model.'
};

module.exports = function siteMetaPlugin(context) {
  return {
    name: 'aiao-site-meta',
    injectHtmlTags() {
      return {
        headTags: [
          {
            tagName: 'meta',
            attributes: {
              name: 'description',
              content: DESCRIPTIONS[context.i18n.currentLocale] ?? DESCRIPTIONS['zh-Hans']
            }
          }
        ]
      };
    }
  };
};
