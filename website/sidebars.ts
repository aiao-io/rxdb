import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';
import type { SidebarItemConfig } from '@docusaurus/plugin-content-docs/lib/sidebars/types.js';

// 英文侧边栏标签：键是中文原文，值沿用 website/i18n/en 英文文档的术语。
const englishSidebarLabels: Readonly<Record<string, string>> = {
  开始使用: 'Getting Started',
  模型定义: 'Model Definition',
  模型查询: 'Model Queries',
  基础查询: 'Basic Queries',
  树形结构查询: 'Tree Queries',
  图结构查询: 'Graph Queries',
  模型修改: 'Model Mutations',
  框架集成: 'Framework Integration',
  '实体模型（rxdb-model）': 'Entity Model (rxdb-model)',
  '后台外壳（rxdb-admin）': 'Admin Shell (rxdb-admin)',
  数据库适配器: 'Database Adapters',
  数据协作: 'Collaboration',
  插件: 'Plugins',
  客户端生成: 'Client Generator',
  代码编辑器组件: 'Code Editor Components',
  'DevTools 调试工具': 'DevTools',
  迁移指南: 'Migration Guides',
  版本兼容矩阵: 'Compatibility Matrix',
  '版本与 API 稳定性策略': 'Versioning and API Stability Policy',
  'API 文档': 'API Reference',
  核心模块: 'Core Modules',
  适配器: 'Adapters',
  国际化: 'Internationalization',
  代码编辑器: 'Code Editor',
  工具与开发者工具: 'Tools and DevTools',
  编写插件: 'Plugin Authoring',
  任务看板: 'Task Boards',
  'P2P 会话与文件共享': 'P2P Sessions and File Sharing'
};

// Docusaurus 3.10 的 docs 插件只接受单一 sidebarPath 字符串（Joi.string()），侧边栏文件
// 也不会以函数形式被调用并拿到 locale 上下文（loadSidebarsFileUnsafe 直接返回模块本身）。
// 官方提供的工作区是 buildLocale 按 locale 设置的 process.env.DOCUSAURUS_CURRENT_LOCALE
// （见 @docusaurus/core/lib/commands/build/buildLocale.js 的注释与 issue #4542）：
// 每个 locale 构建前都会设置该变量并重新加载模块，因此这里按它选择标签语言。
const currentLocale = process.env.DOCUSAURUS_CURRENT_LOCALE;

function localizeItem(item: SidebarItemConfig): SidebarItemConfig {
  if (currentLocale !== 'en' || typeof item === 'string') {
    return item;
  }
  if (item.type === 'category') {
    return {
      ...item,
      label: englishSidebarLabels[item.label] ?? item.label,
      items:
        Array.isArray(item.items) ?
          item.items.map(localizeItem)
        : Object.fromEntries(
            Object.entries(item.items).map(([category, value]) => [
              category,
              Array.isArray(value) ? value.map(localizeItem) : value
            ])
          )
    };
  }
  if ((item.type === 'doc' || item.type === 'ref' || item.type === 'link') && typeof item.label === 'string') {
    return { ...item, label: englishSidebarLabels[item.label] ?? item.label };
  }
  return item;
}

const sidebars: SidebarsConfig = {
  tutorialSidebar: [
    'README',
    {
      type: 'category',
      label: '开始使用',
      collapsed: true,
      link: {
        type: 'doc',
        id: 'getting-started/README'
      },
      items: ['getting-started/install', 'getting-started/capabilities', 'getting-started/compare']
    },
    {
      type: 'category',
      label: '模型定义',
      collapsed: true,
      link: {
        type: 'doc',
        id: 'model-definition/README'
      },
      items: [
        'model-definition/properties',
        'model-definition/relations',
        'model-definition/indexes',
        'model-definition/constraints',
        'model-definition/cascade',
        'model-definition/permissions',
        'model-definition/structure-tree'
      ]
    },
    {
      type: 'category',
      label: '模型查询',
      collapsed: true,
      link: {
        type: 'doc',
        id: 'model-query/README'
      },
      items: [
        {
          type: 'category',
          label: '基础查询',
          items: [
            'model-query/get',
            'model-query/find',
            'model-query/findAll',
            'model-query/findOne',
            'model-query/findOneOrFail',
            'model-query/findByCursor',
            'model-query/count'
          ]
        },
        {
          type: 'category',
          label: '树形结构查询',
          items: [
            'model-query/findDescendants',
            'model-query/findAncestors',
            'model-query/countDescendants',
            'model-query/countAncestors'
          ]
        },
        {
          type: 'category',
          label: '图结构查询',
          items: ['model-query/findNeighbors', 'model-query/countNeighbors', 'model-query/findPaths']
        },
        'model-query/operators',
        'model-query/query-realtime',
        'model-query/exists-operator'
      ]
    },
    {
      type: 'category',
      label: '模型修改',
      collapsed: true,
      link: {
        type: 'doc',
        id: 'model-mutation/README'
      },
      items: [
        'model-mutation/create',
        'model-mutation/update',
        'model-mutation/delete',
        'model-mutation/transaction',
        'model-mutation/reorder'
      ]
    },
    {
      type: 'category',
      label: '框架集成',
      key: 'frameworks',
      collapsed: true,
      link: {
        type: 'doc',
        id: 'frameworks/README'
      },
      items: ['frameworks/react', 'frameworks/vue', 'frameworks/angular', 'frameworks/taro']
    },
    {
      type: 'category',
      label: '实体模型（rxdb-model）',
      key: 'entity-model',
      collapsed: true,
      link: {
        type: 'doc',
        id: 'entity-model/README'
      },
      items: [
        'entity-model/core',
        'entity-model/angular',
        'entity-model/react',
        'entity-model/vue',
        'entity-model/headless',
        'entity-model/styling',
        'entity-model/admin-workbench-cost',
        'entity-model/migration'
      ]
    },
    {
      type: 'category',
      label: '后台外壳（rxdb-admin）',
      key: 'admin-shell',
      collapsed: true,
      link: {
        type: 'doc',
        id: 'admin-shell/README'
      },
      items: ['admin-shell/preferences', 'admin-shell/frameworks']
    },
    'i18n/README',
    {
      type: 'category',
      label: '数据库适配器',
      key: 'adapters',
      collapsed: true,
      link: {
        type: 'doc',
        id: 'adapters/README'
      },
      items: [
        'adapters/sqlite',
        'adapters/pglite',
        'adapters/supabase',
        'adapters/http',
        'adapters/http-protocol',
        'adapters/sqlite-wasm',
        'adapters/sqliteai',
        'adapters/encrypted',
        'adapters/miniprogram',
        'adapters/electron',
        'adapters/tauri',
        'adapters/backup'
      ]
    },
    {
      type: 'category',
      label: '数据协作',
      collapsed: true,
      link: {
        type: 'doc',
        id: 'collaboration/README'
      },
      items: ['collaboration/branch', 'collaboration/sync', 'collaboration/undo-redo']
    },
    {
      type: 'category',
      label: '插件',
      key: 'plugins',
      collapsed: true,
      link: { type: 'doc', id: 'plugins/README' },
      items: [
        {
          type: 'doc',
          label: '编写插件',
          id: 'plugins/authoring'
        },
        { type: 'doc', label: '任务看板', id: 'plugins/rxdb-plugin-board/README' },
        { type: 'doc', label: 'P2P 会话与文件共享', id: 'plugins/rxdb-plugin-p2p/README' },
        {
          type: 'doc',
          label: 'rxdb-plugin-storage',
          id: 'plugins/rxdb-plugin-storage/README'
        },
        {
          type: 'category',
          label: 'rxdb-plugin-graph',
          collapsed: true,
          link: {
            type: 'doc',
            id: 'plugins/rxdb-plugin-graph/README'
          },
          items: ['plugins/rxdb-plugin-graph/graph-entity']
        },
        {
          type: 'doc',
          label: 'rxdb-plugin-workspace',
          id: 'plugins/rxdb-plugin-workspace/README'
        },
        {
          type: 'doc',
          label: 'rxdb-plugin-search',
          id: 'plugins/rxdb-plugin-search/README'
        },
        {
          type: 'doc',
          label: 'rxdb-plugin-working-tree',
          id: 'plugins/rxdb-plugin-working-tree/README'
        },
        {
          type: 'doc',
          label: 'rxdb-plugin-replay',
          id: 'plugins/rxdb-plugin-replay/README'
        },
        {
          type: 'doc',
          label: 'rxdb-plugin-tree',
          id: 'plugins/rxdb-plugin-tree/README'
        },
        {
          type: 'doc',
          label: 'rxdb-plugin-history',
          id: 'plugins/rxdb-plugin-history/README'
        },
        {
          type: 'doc',
          label: 'rxdb-plugin-sync',
          id: 'plugins/rxdb-plugin-sync/README'
        },
        {
          type: 'doc',
          label: 'rxdb-plugin-querycache',
          id: 'plugins/rxdb-plugin-querycache/README'
        }
      ]
    },
    {
      type: 'doc',
      label: '客户端生成',
      id: 'client-generator'
    },
    {
      type: 'doc',
      label: '代码编辑器组件',
      id: 'code-editor/README'
    },
    {
      type: 'doc',
      label: 'DevTools 调试工具',
      id: 'devtools/README'
    },
    {
      type: 'category',
      label: '迁移指南',
      collapsed: true,
      link: {
        type: 'doc',
        id: 'migration/README'
      },
      items: [
        'migration/v1',
        'migration/frameworks',
        'migration/adapters',
        'migration/supabase-network-errors',
        'migration/supabase-update-push',
        'migration/supabase-change-log-order',
        'migration/supabase-remote-backend',
        'migration/supabase-push-receipts',
        'migration/http-page-token',
        'migration/desktop-split',
        'migration/working-tree-split',
        'migration/tree-split',
        'migration/branch-detree',
        'migration/plugins',
        'migration/plugin-scope',
        'migration/history-sync-plugins',
        'migration/querycache-plugin',
        'migration/remote-sync-options',
        'migration/writer-lease-removal',
        'migration/generator-default',
        'migration/actions-column-can-delete',
        'migration/table-set-parameter',
        'migration/schema'
      ]
    },
    {
      type: 'doc',
      label: '版本兼容矩阵',
      id: 'compatibility'
    },
    {
      type: 'doc',
      label: '版本与 API 稳定性策略',
      id: 'versioning'
    },
    {
      type: 'category',
      label: 'API 文档',
      key: 'api',
      collapsed: true,
      link: {
        type: 'doc',
        id: 'api/README'
      },
      items: [
        {
          type: 'category',
          label: '核心模块',
          link: {
            type: 'doc',
            id: 'api/README'
          },
          items: [
            {
              type: 'autogenerated',
              dirName: 'api/rxdb'
            }
          ]
        },
        {
          type: 'category',
          label: '适配器',
          key: 'api-adapters',
          link: {
            type: 'doc',
            id: 'adapters/README'
          },
          items: [
            { type: 'autogenerated', dirName: 'api/rxdb-adapter-wa-sqlite' },
            { type: 'autogenerated', dirName: 'api/rxdb-adapter-pglite' },
            { type: 'autogenerated', dirName: 'api/rxdb-adapter-supabase' },
            { type: 'autogenerated', dirName: 'api/rxdb-adapter-sqlite' },
            { type: 'autogenerated', dirName: 'api/rxdb-adapter-sqlite-core' },
            { type: 'autogenerated', dirName: 'api/rxdb-adapter-sqlite-wasm' },
            { type: 'autogenerated', dirName: 'api/rxdb-adapter-sqliteai' },
            { type: 'autogenerated', dirName: 'api/rxdb-adapter-encrypted' },
            { type: 'autogenerated', dirName: 'api/rxdb-adapter-electron' },
            { type: 'autogenerated', dirName: 'api/rxdb-adapter-tauri' },
            { type: 'autogenerated', dirName: 'api/rxdb-adapter-http' },
            { type: 'autogenerated', dirName: 'api/rxdb-adapter-miniprogram' }
          ]
        },
        {
          type: 'category',
          label: '框架集成',
          key: 'api-frameworks',
          link: {
            type: 'doc',
            id: 'frameworks/README'
          },
          items: [
            { type: 'autogenerated', dirName: 'api/rxdb-angular' },
            { type: 'autogenerated', dirName: 'api/rxdb-react' },
            { type: 'autogenerated', dirName: 'api/rxdb-vue' }
          ]
        },
        {
          type: 'category',
          label: '实体模型（rxdb-model）',
          key: 'api-entity-model',
          link: {
            type: 'doc',
            id: 'entity-model/README'
          },
          items: [
            { type: 'autogenerated', dirName: 'api/rxdb-model' },
            { type: 'autogenerated', dirName: 'api/rxdb-model-angular' },
            { type: 'autogenerated', dirName: 'api/rxdb-model-react' },
            { type: 'autogenerated', dirName: 'api/rxdb-model-vue' }
          ]
        },
        {
          type: 'category',
          label: '后台外壳（rxdb-admin）',
          key: 'api-admin-shell',
          link: {
            type: 'doc',
            id: 'admin-shell/README'
          },
          items: [
            { type: 'autogenerated', dirName: 'api/rxdb-admin' },
            { type: 'autogenerated', dirName: 'api/rxdb-admin-angular' },
            { type: 'autogenerated', dirName: 'api/rxdb-admin-react' },
            { type: 'autogenerated', dirName: 'api/rxdb-admin-vue' }
          ]
        },
        {
          type: 'category',
          label: '国际化',
          key: 'api-i18n',
          link: {
            type: 'doc',
            id: 'i18n/README'
          },
          items: [
            { type: 'autogenerated', dirName: 'api/rxdb-i18n' },
            { type: 'autogenerated', dirName: 'api/rxdb-i18n-angular' },
            { type: 'autogenerated', dirName: 'api/rxdb-i18n-react' },
            { type: 'autogenerated', dirName: 'api/rxdb-i18n-vue' }
          ]
        },
        {
          type: 'category',
          label: '插件',
          key: 'api-plugins',
          link: {
            type: 'doc',
            id: 'plugins/authoring'
          },
          items: [
            { type: 'autogenerated', dirName: 'api/rxdb-plugin-board' },
            { type: 'autogenerated', dirName: 'api/rxdb-plugin-board-angular' },
            { type: 'autogenerated', dirName: 'api/rxdb-plugin-board-react' },
            { type: 'autogenerated', dirName: 'api/rxdb-plugin-board-vue' },
            { type: 'autogenerated', dirName: 'api/rxdb-plugin-bom' },
            { type: 'autogenerated', dirName: 'api/rxdb-plugin-bom-angular' },
            { type: 'autogenerated', dirName: 'api/rxdb-plugin-bom-react' },
            { type: 'autogenerated', dirName: 'api/rxdb-plugin-bom-vue' },
            { type: 'autogenerated', dirName: 'api/rxdb-plugin-p2p' },

            { type: 'autogenerated', dirName: 'api/rxdb-plugin-graph' },
            { type: 'autogenerated', dirName: 'api/rxdb-plugin-workspace' },
            { type: 'autogenerated', dirName: 'api/rxdb-plugin-storage' },
            { type: 'autogenerated', dirName: 'api/rxdb-plugin-replay' },
            { type: 'autogenerated', dirName: 'api/rxdb-plugin-replay-angular' },
            { type: 'autogenerated', dirName: 'api/rxdb-plugin-replay-react' },
            { type: 'autogenerated', dirName: 'api/rxdb-plugin-replay-vue' },
            { type: 'autogenerated', dirName: 'api/rxdb-plugin-search' },
            { type: 'autogenerated', dirName: 'api/rxdb-plugin-search-angular' },
            { type: 'autogenerated', dirName: 'api/rxdb-plugin-search-react' },
            { type: 'autogenerated', dirName: 'api/rxdb-plugin-search-vue' },
            { type: 'autogenerated', dirName: 'api/rxdb-plugin-working-tree' },
            { type: 'autogenerated', dirName: 'api/rxdb-plugin-working-tree-angular' },
            { type: 'autogenerated', dirName: 'api/rxdb-plugin-working-tree-react' },
            { type: 'autogenerated', dirName: 'api/rxdb-plugin-working-tree-vue' },
            { type: 'autogenerated', dirName: 'api/rxdb-plugin-tree' },
            { type: 'autogenerated', dirName: 'api/rxdb-plugin-tree-angular' },
            { type: 'autogenerated', dirName: 'api/rxdb-plugin-tree-react' },
            { type: 'autogenerated', dirName: 'api/rxdb-plugin-tree-vue' },
            { type: 'autogenerated', dirName: 'api/rxdb-plugin-history' },
            { type: 'autogenerated', dirName: 'api/rxdb-plugin-sync' },
            { type: 'autogenerated', dirName: 'api/rxdb-plugin-querycache' }
          ]
        },
        {
          type: 'category',
          label: '代码编辑器',
          key: 'api-code-editor',
          link: {
            type: 'doc',
            id: 'api/README'
          },
          items: [
            { type: 'autogenerated', dirName: 'api/code-editor' },
            { type: 'autogenerated', dirName: 'api/code-editor-angular' },
            { type: 'autogenerated', dirName: 'api/code-editor-react' },
            { type: 'autogenerated', dirName: 'api/code-editor-vue' }
          ]
        },
        {
          type: 'category',
          label: '工具与开发者工具',
          key: 'api-tools',
          link: {
            type: 'doc',
            id: 'api/README'
          },
          items: [
            { type: 'autogenerated', dirName: 'api/utils' },
            { type: 'autogenerated', dirName: 'api/rxdb-client-generator' },
            { type: 'autogenerated', dirName: 'api/rxdb-devtools' },
            { type: 'autogenerated', dirName: 'api/rxdb-taro' }
          ]
        }
      ]
    }
  ]
};

export default {
  tutorialSidebar: (sidebars.tutorialSidebar as SidebarItemConfig[]).map(localizeItem)
} as SidebarsConfig;
