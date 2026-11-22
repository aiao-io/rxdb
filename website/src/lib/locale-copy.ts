import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import { useCallback } from 'react';

const englishCopy: Readonly<Record<string, string>> = {
  '浏览器内运行 SQLite 查询、事务与索引': 'Run SQLite queries, transactions, and indexes in the browser',
  'RxJS 统一查询结果与数据变更': 'Use RxJS to unify query results and data changes',
  '一套实体模型，对接 Angular、React、Vue': 'One entity model for Angular, React, and Vue',
  数据在本地执行: 'Execute data locally',
  '查询、事务、索引与持久化在浏览器内完成，常用读写无需等待网络往返。':
    'Queries, transactions, indexes, and persistence run in the browser, so common reads and writes do not wait for a network round trip.',
  查询结果可订阅: 'Subscribe to query results',
  '数据变化会更新订阅结果，减少手动 refetch、缓存失效和状态同步代码。':
    'Data changes update subscribed results and reduce manual refetching, cache invalidation, and state synchronization code.',
  模型集中定义规则: 'Define rules in the model',
  '字段、关系、索引与类型集中在实体模型中，避免数据规则散落在页面和服务层。':
    'Fields, relations, indexes, and types stay in the entity model instead of being scattered across pages and services.',
  跨框架共享语义: 'Share semantics across frameworks',
  'Angular、React、Vue 共享模型、查询与写入语义，差异保留在各自的 UI 绑定层。':
    'Angular, React, and Vue share model, query, and write semantics while their UI binding details remain native to each framework.',
  定义模型边界: 'Define the model boundary',
  '先定义字段、关系与索引，为后续查询、表单和列表建立稳定的数据边界。':
    'Define fields, relations, and indexes first to create a stable boundary for queries, forms, and lists.',
  接入本地执行层: 'Connect the local execution layer',
  '按查询与兼容性需求选择 SQLite 或 PGlite，在浏览器内完成查询与持久化。':
    'Choose SQLite or PGlite for the query and compatibility requirements, then execute and persist data in the browser.',
  订阅查询结果: 'Subscribe to query results',
  '将查询结果作为可订阅数据源接入界面，由数据变化驱动视图更新。':
    'Connect query results as a reactive data source and let data changes drive the view.',
  按需引入协作: 'Add collaboration when needed',
  '本地读写链路稳定后，再按业务需要引入分支、撤销重做与同步。':
    'Once local reads and writes are stable, add branches, undo/redo, and synchronization as the product requires.',
  复杂后台与表单: 'Complex back-office and forms',
  '使用 Signals 绑定查询和实体状态，查看表单、关系数据与管理页面的实现。':
    'Use Signals to bind queries and entity state across forms, relations, and management pages.',
  组件化数据应用: 'Component-based data applications',
  '使用 Hooks 订阅查询和实体状态，查看列表、编辑器与分支管理的实现。':
    'Use Hooks to subscribe to queries and entity state across lists, editors, and branch management.',
  高迭代业务界面: 'Fast-moving product interfaces',
  '使用 Composables 连接响应式实体，查看表格、关系页与文件管理的实现。':
    'Use Composables to connect reactive entities across tables, relation pages, and file management.',
  快速开始: 'Getting Started',
  '从模型定义到 UI 绑定，跑通一条最小本地数据链路。':
    'Run the smallest local data path from model definition to UI binding.',
  模型定义: 'Model Definition',
  '了解如何集中定义字段、关系与索引，并生成类型安全的数据接口。':
    'Define fields, relations, and indexes in one place and derive type-safe data interfaces.',
  模型查询: 'Model Queries',
  '查看基础查询、树图结构查询与实时订阅的完整读取路径。':
    'Explore basic queries, tree and graph queries, and reactive subscriptions.',
  模型修改: 'Model Mutations',
  '通过统一入口完成创建、更新、删除与事务操作。':
    'Create, update, delete, and transact through one consistent entry point.',
  数据协作: 'Collaboration',
  '分支、撤销重做与同步如何按需叠加到已稳定的本地链路之上。':
    'Add branches, undo/redo, and synchronization to a stable local data path.',
  '实体 UI 与 Headless': 'Entity UI and Headless',
  '使用元数据驱动的表单、列表与详情，或通过独立控制器渲染自己的界面。':
    'Use metadata-driven forms, lists, and details, or render your own UI with headless controllers.',
  后台外壳: 'Admin Shell',
  '接入三框架后台导航、布局、用户偏好和可运行模板。':
    'Add shared navigation, layout, preferences, and runnable templates for all three frameworks.',
  客户端国际化: 'Client Internationalization',
  '统一 ICU 文案与日期、数字格式化，按需持久化语言偏好和目录。':
    'Unify ICU messages and date and number formatting, with optional persisted preferences and catalogs.',
  '看板与 P2P': 'Boards and P2P',
  '查看单人任务看板、认证会话和文件共享的接入方式与当前边界。':
    'Review task boards, authenticated sessions, file sharing, and their current boundaries.',
  在线演示: 'Live Demos',
  '直接对比 RxDB 在 Angular、React、Vue 中的真实接入方式与页面复杂度':
    'Compare how RxDB is integrated in Angular, React, and Vue through runnable pages and realistic UI complexity.',
  'RxDB 为 Angular、React、Vue 提供浏览器内数据库、响应式查询与类型安全的统一模型。':
    'RxDB provides Angular, React, and Vue with an in-browser database, reactive queries, and a type-safe shared model.',
  '对照三套框架的可运行页面与源码，评估实际接入方式。':
    'Compare runnable pages and source code across all three frameworks.',
  浏览器内的数据基础设施: 'In-browser data infrastructure',
  '在浏览器内完成结构化数据的查询、写入与持久化，通过 RxJS 响应数据变化为 Angular、React、Vue 提供一致的模型语义。需要跨设备共享时，再按需连接远端同步。':
    'Query, write, and persist structured data in the browser. Use RxJS to expose consistent model semantics to Angular, React, and Vue, then connect remote synchronization when cross-device sharing is required.',
  查看框架演示: 'View framework demos',
  '查看 Angular 接入': 'View the Angular integration',
  '查看 React 接入': 'View the React integration',
  '查看 Vue 接入': 'View the Vue integration',
  了解架构: 'Explore the architecture',
  浏览器内执行引擎: 'In-browser execution engine',
  '按能力选择 OPFS / IDB': 'Choose OPFS or IndexedDB by capability',
  查询与事件同一主线: 'Queries and events on one stream',
  复杂数据应用需要明确的数据层: 'Complex data applications need a clear data layer',
  '把存储、查询、写入与响应式更新放进一条可验证的链路，避免用页面状态承担数据基础设施的职责。':
    'Put storage, queries, writes, and reactive updates into one verifiable path instead of making page state carry data infrastructure responsibilities.',
  用四步验证最小数据链路: 'Verify the smallest data path in four steps',
  '推荐顺序：定义模型 → 接入数据库 → 订阅查询 → 按需增加同步与协作。每一步都有清晰的验证结果。':
    'Recommended order: define the model → connect the database → subscribe to queries → add synchronization and collaboration when needed. Each step has a clear verification result.',
  '三套框架，共享一套数据语义': 'Three frameworks, one data model',
  '模型、查询与写入规则由核心层提供；Angular、React、Vue 分别使用 Signals、Hooks 与 Composables 完成 UI 绑定。':
    'The core provides model, query, and write rules. Angular, React, and Vue use Signals, Hooks, and Composables for UI binding.',
  文档按接入顺序组织: 'Documentation follows the integration path',
  '从最小链路开始，再进入建模、查询、写入与协作主题。每一部分都对应明确的使用场景。':
    'Start with the smallest path, then move through modeling, queries, writes, and collaboration. Each section maps to a concrete use case.',
  '跑通最小链路，再评估接入': 'Run the smallest path before evaluating integration',
  '先完成模型、数据库、查询和 UI 绑定，再通过三套框架演示与架构说明核对能力边界。':
    'Complete the model, database, queries, and UI binding first, then use the three framework demos and architecture guide to verify the capability boundary.',
  进入快速开始: 'Open Getting Started',
  打开在线演示: 'Open live demos',
  适用场景: 'Use cases',
  '使用 Signals 绑定查询与实体状态，覆盖表单、关系数据和管理页面。':
    'Use Signals for queries and entity state across forms, relations, and management pages.',
  表单与管理页面: 'Forms and management pages',
  'Signals 绑定': 'Signals binding',
  实体表单: 'Entity forms',
  任务看板: 'Task boards',
  国际化: 'Internationalization',
  '使用 Hooks 订阅查询与实体状态，覆盖列表、编辑器和分支管理。':
    'Use Hooks for queries and entity state across lists, editors, and branch management.',
  'Hooks 查询': 'Hooks queries',
  代码编辑器: 'Code editor',
  '使用 Composables 连接响应式实体，覆盖表格、关系页和文件管理。':
    'Use Composables for reactive entities across tables, relation pages, and file management.',
  表格与文件管理: 'Tables and file management',
  Composables: 'Composables',
  实体详情: 'Entity details',
  同一套模型: 'One shared model',
  '三个演示共用实体模型、查询结构与数据库能力。':
    'All three demos share the entity model, query structure, and database capabilities.',
  差异只在绑定层: 'Differences stay in the binding layer',
  '框架差异集中在 UI 绑定 API，核心数据语义保持一致。':
    'Framework differences stay in the UI binding APIs while core data semantics remain the same.',
  源码可直接对照: 'Compare the source directly',
  '每个演示都对应 apps/dev-rxdb-* 下的完整源码。': 'Each demo maps to a complete application under apps/dev-rxdb-*.',
  覆盖完整业务场景: 'Cover complete product scenarios',
  '包含关系详情页、任务看板、语言切换与文件管理，可用于评估实际接入。':
    'The demos include relation details, task boards, language switching, and file management for integration evaluation.',
  查询结果如何自动更新: 'How query results update automatically',
  '详情页和关系 Tab 如何组织数据': 'How detail pages and relation tabs organize data',
  '同一模型在三套框架里的 API 差异有多小': 'How small the API differences are across the three frameworks',
  'Query Builder、Branch Manager、File Manager 是否够真实':
    'Whether Query Builder, Branch Manager, and File Manager match real application needs',
  同一套实体模型: 'One shared entity model',
  三种框架绑定方式: 'Three framework binding styles',
  '在可运行页面中对照 Angular、React、Vue 的查询订阅、实体状态与复杂视图实现，并可继续查看对应源码。':
    'Compare query subscriptions, entity state, and complex views in runnable Angular, React, and Vue pages, then inspect the corresponding source.',
  更多能力与本地示例: 'More capabilities and local examples',
  进入演示: 'Open demo',
  从演示进入对应文档: 'From demos to the matching docs',
  '演示用于比较框架绑定方式；文档进一步说明模型、查询、写入与协作 API 的完整边界。':
    'Use the demos to compare framework bindings. The documentation explains the full boundaries of model, query, write, and collaboration APIs.',
  打开快速开始: 'Open Getting Started',
  'Angular 演示': 'Angular Demo',
  'React 演示': 'React Demo',
  'Vue 演示': 'Vue Demo',
  '查看 RxDB 在 Angular 中的查询、实体详情、关系数据与管理页面实现':
    'Explore queries, entity details, relationships, and admin pages in Angular.',
  '查看 RxDB 在 React 中的查询、实体详情、代码编辑器与分支管理实现':
    'Explore queries, entity details, the code editor, and branch management in React.',
  '查看 RxDB 在 Vue 中的查询、实体详情、关系页与文件管理实现':
    'Explore queries, entity details, relationships, and file management in Vue.',
  基准测试: 'Benchmarks',
  演示启动失败: 'The demo could not start.',
  'RxDB 基准测试': 'RxDB Benchmarks',
  '在独立运行的基准测试应用中查看 RxDB 的实时测试结果': 'Run the RxDB benchmarks and inspect their results.',
  演示运行失败: 'The demo stopped running.',
  重新加载演示: 'Reload demo',
  '界面与源码 1:1 对照': 'Compare UI and source 1:1'
};

export function siteCopy(value: string, locale: string): string {
  return locale === 'en' ? (englishCopy[value] ?? value) : value;
}

export function useSiteCopy(): (value: string) => string {
  const { i18n } = useDocusaurusContext();
  return useCallback((value: string) => siteCopy(value, i18n.currentLocale), [i18n.currentLocale]);
}
