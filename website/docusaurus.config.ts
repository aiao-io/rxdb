import type * as Preset from '@docusaurus/preset-classic';
import type { Config } from '@docusaurus/types';
import { themes as prismThemes } from 'prism-react-renderer';

// 这在 Node.js 中运行 - 请勿在此处使用客户端代码（浏览器 API、JSX...）

const config: Config = {
  title: 'RxDB',
  tagline: '面向 Angular、React、Vue 的浏览器内数据库、响应式查询与统一实体模型',
  favicon: '/favicon.ico',
  // 未来标志，详见 https://docusaurus.io/docs/api/docusaurus-config#future
  future: {
    // 提升与即将推出的 Docusaurus v4 的兼容性
    v4: true,
    // 启用 Docusaurus Faster：https://github.com/facebook/docusaurus/issues/10556
    faster: true
  },

  // 在此处设置站点的生产 URL
  url: 'https://docs.aiao.io',
  // 设置站点服务的 /<baseUrl>/ 路径名
  // 对于 GitHub Pages 部署，通常是 '/<projectName>/'
  baseUrl: '/',

  // GitHub Pages 部署配置
  // 如果不使用 GitHub Pages，则不需要这些配置
  organizationName: 'aiao-io', // 通常是您的 GitHub 组织/用户名
  projectName: 'aiao', // 通常是您的仓库名称

  onBrokenLinks: 'throw',
  onBrokenAnchors: 'throw',

  // 静态目录配置 - 从 public/ 复制到构建输出的根目录
  staticDirectories: ['public'],

  // 即使不使用国际化，也可以使用此字段设置
  // 有用的元数据，如 html lang。例如，如果您的站点是中文，
  // 您可能希望将 "en" 替换为 "zh-Hans"
  i18n: {
    defaultLocale: 'zh-Hans',
    locales: ['zh-Hans']
  },

  trailingSlash: false,

  markdown: {
    mermaid: true,
    hooks: {
      onBrokenMarkdownLinks: 'warn'
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
        name: 'keywords',
        content: 'Aiao, Local-first, RxDB, RxJS, WebAssembly, SQLite, PGlite, Angular, React, Vue, TypeScript'
      },
      {
        name: 'description',
        content: 'RxDB 为 Angular、React、Vue 提供浏览器内数据库、响应式查询与类型安全的统一实体模型。'
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
