import type * as Preset from '@docusaurus/preset-classic';
import type { Config } from '@docusaurus/types';
import { themes as prismThemes } from 'prism-react-renderer';

// 这在 Node.js 中运行 - 请勿在此处使用客户端代码（浏览器 API、JSX...）

// 站点配置的 title / tagline / 站点级描述没有官方的 code.json 翻译机制：Docusaurus
// 3.10 的 write-translations 不提取 site.* 键，@docusaurus/core 与 theme-classic
// 源码里也没有消费 site.tagline 的代码（siteConfig 原样序列化给客户端；
// SiteMetadataDefaults 只输出 og:title，tagline 不会成为任何页面的
// og:description / meta description 兜底）。官方给出的工作区是 buildLocale 按
// locale 设置的 process.env.DOCUSAURUS_CURRENT_LOCALE（issue #4542），与
// sidebars.ts 的做法一致。
const tagline =
  process.env.DOCUSAURUS_CURRENT_LOCALE === 'en' ?
    'An in-browser database, reactive queries, and a unified entity model for Angular, React, and Vue'
  : '面向 Angular、React、Vue 的浏览器内数据库、响应式查询与统一实体模型';

// 站点级 <meta name="description"> 放在 themeConfig.metadata 里（见下），由
// theme-classic 的 SiteMetadata 经 react-helmet-async 输出：与页面级 PageMetadata
// （frontMatter/excerpt/Layout 属性）走同一条去重管线，helmet 按 meta 的 name
// 属性去重、后渲染者胜，因此带自有描述的页面只有一条页面级描述，无自有描述的
// 页面才落到这里。此前 src/plugins/site-meta.js 用 injectHtmlTags 注入的是绕过
// helmet 的静态 HTML 片段，与页面级描述重复出现（en 首页两条互相冲突），已删除。
// zh 文案与历史上静态 metadata 条目逐字节一致。
const description =
  process.env.DOCUSAURUS_CURRENT_LOCALE === 'en' ?
    'RxDB provides Angular, React, and Vue with an in-browser database, reactive queries, and a type-safe unified entity model.'
  : 'RxDB 为 Angular、React、Vue 提供浏览器内数据库、响应式查询与类型安全的统一实体模型。';

const config: Config = {
  title: 'RxDB',
  tagline,
  favicon: '/favicon.ico',
  // 未来标志，详见 https://docusaurus.io/docs/api/docusaurus-config#future
  future: {
    // 提升与即将推出的 Docusaurus v4 的兼容性
    v4: true,
    // 启用 Docusaurus Faster：https://github.com/facebook/docusaurus/issues/10556
    faster: true
  },

  // 在此处设置站点的生产 URL
  url: 'https://rxdb.aiao.io',
  // 设置站点服务的 /<baseUrl>/ 路径名
  // 对于 GitHub Pages 部署，通常是 '/<projectName>/'
  baseUrl: '/',

  // GitHub Pages 部署配置
  // 如果不使用 GitHub Pages，则不需要这些配置
  organizationName: 'aiao-io', // 通常是您的 GitHub 组织/用户名
  projectName: 'rxdb', // 通常是您的仓库名称

  onBrokenLinks: 'throw',
  onBrokenAnchors: 'throw',

  // 静态目录配置 - 从 public/ 复制到构建输出的根目录
  staticDirectories: ['public'],

  i18n: {
    defaultLocale: 'zh-Hans',
    locales: ['zh-Hans', 'en'],
    localeConfigs: {
      'zh-Hans': {
        label: '简体中文',
        htmlLang: 'zh-CN'
      },
      en: {
        label: 'English',
        htmlLang: 'en'
      }
    }
  },

  trailingSlash: false,

  markdown: {
    mermaid: true,
    hooks: {
      onBrokenMarkdownLinks: 'throw'
    }
  },
  themes: [
    '@docusaurus/theme-mermaid',
    '@docusaurus/theme-live-codeblock',
    [
      require.resolve('@easyops-cn/docusaurus-search-local'),
      {
        hashed: 'filename',
        language: ['en', 'zh'],
        indexDocs: true,
        indexBlog: true,
        indexPages: true,
        docsRouteBasePath: '/docs',
        searchBarPosition: 'right',
        explicitSearchResultPath: true,
        removeDefaultStopWordFilter: ['en']
      }
    ]
  ],
  plugins: [
    ['./src/plugins/tailwind-config.js', {}],
    ['./src/plugins/demo-routes.js', {}],
    ['./src/plugins/llms-txt.js', {}],
    [
      'ideal-image',
      {
        quality: 70,
        max: 1030,
        min: 640,
        steps: 2,
        disableInDev: true
      }
    ]
  ],
  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          // 请更改为您的仓库
          // 删除此项可移除"编辑此页面"链接
          editUrl: 'https://github.com/aiao-io/rxdb/tree/main/website/',
          editLocalizedFiles: true,
          showLastUpdateAuthor: true,
          showLastUpdateTime: true,
          remarkPlugins: [[require('@docusaurus/remark-plugin-npm2yarn'), { sync: true }]],
          // API 文档也使用主侧边栏（tutorialSidebar）
          sidebarCollapsible: true,
          sidebarCollapsed: false
        },
        theme: {
          customCss: './src/styles.css'
        }
      } satisfies Preset.Options
    ]
  ],
  themeConfig: {
    image: '/logo.svg',
    metadata: [
      {
        // 站点级描述兜底：helmet 按 name 去重，页面级 PageMetadata 的描述会覆盖它
        name: 'description',
        content: description
      },
      {
        name: 'keywords',
        content: 'Aiao, Local-first, RxDB, RxJS, WebAssembly, SQLite, PGlite, Angular, React, Vue, TypeScript'
      }
    ],
    colorMode: {
      defaultMode: 'dark',
      disableSwitch: false,
      respectPrefersColorScheme: false
    },
    navbar: {
      title: 'RxDB',
      logo: {
        alt: 'RxDB Logo',
        src: '/logo.svg'
      },
      items: [
        { to: '/docs/getting-started/', label: '文档', position: 'left' },
        { to: '/architecture', label: '架构', position: 'left' },
        { to: '/comparison', label: '对比', position: 'left' },
        { to: '/demos', label: '演示', position: 'left' },
        { to: '/benchmarks', label: '基准测试', position: 'left' },
        { to: '/blog', label: '博客', position: 'left' },
        { type: 'localeDropdown', position: 'right' },
        {
          href: 'https://github.com/aiao-io/rxdb',
          position: 'right',
          className: 'header-github-link',
          'aria-label': 'GitHub repository'
        }
      ]
    },
    footer: {
      links: [
        {
          title: '文档',
          items: [
            { label: '快速开始', to: '/docs/getting-started/' },
            { label: '模型定义', to: '/docs/model-definition/' },
            { label: '数据协作', to: '/docs/collaboration/branch' }
          ]
        },
        {
          title: '资源',
          items: [
            { label: '架构说明', to: '/architecture' },
            { label: '适用场景', to: '/comparison' },
            { label: '在线演示', to: '/demos' },
            { label: '基准测试', to: '/benchmarks' }
          ]
        },
        {
          title: '社区',
          items: [
            { label: 'GitHub', href: 'https://github.com/aiao-io/rxdb' },
            { label: '更新日志', href: 'https://github.com/aiao-io/rxdb/blob/main/CHANGELOG.md' },
            { label: '贡献指南', href: 'https://github.com/aiao-io/rxdb/blob/main/CONTRIBUTING.md' }
          ]
        }
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Aiao Team. RxDB 是 Aiao 的浏览器内数据基础设施。`
    },
    prism: {
      theme: prismThemes.oneLight,
      darkTheme: prismThemes.oneDark
    }
  } satisfies Preset.ThemeConfig
};

export default config;
