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
  '界面与源码 1:1 对照': 'Compare UI and source 1:1',
  技术架构: 'Architecture',
  'RxDB 如何把数据库、响应式查询、模型驱动开发与同步协作在浏览器内组织成清晰层次':
    'How RxDB organizes the database, reactive queries, model-driven development, and sync collaboration into clear layers inside the browser',
  'RxDB 如何组织浏览器内数据链路': 'How RxDB organizes the in-browser data path',
  '存储、响应式查询、实体模型与 UI 绑定分别承担明确职责，远端同步作为可选协作层接入。':
    'Storage, reactive queries, the entity model, and UI binding each carry a clear responsibility, with remote sync joining as an optional collaboration layer.',
  存储层: 'Storage layer',
  'SQLite 负责落盘、索引、事务与查询执行。': 'SQLite handles persistence, indexes, transactions, and query execution.',
  响应式层: 'Reactive layer',
  'RxJS 把查询结果、实体变更和副作用汇成同一条数据流。':
    'RxJS merges query results, entity changes, and side effects into a single stream.',
  模型层: 'Model layer',
  '实体元数据统一定义字段、关系、查询构造与生成代码的边界。':
    'Entity metadata defines the boundaries of fields, relations, query construction, and generated code in one place.',
  协作层: 'Collaboration layer',
  '分支、同步与撤销重做建立在本地数据版本之上，按需启用。':
    'Branching, sync, and undo/redo build on local data versions and are enabled as needed.',
  '四个层次，按执行职责划分': 'Four layers, split by execution responsibility',
  浏览器就是主执行面: 'The browser is the primary execution plane',
  'UI、业务规则、查询与持久化在浏览器内执行；远端负责交换变更，不接管每一次本地读写。':
    'UI, business rules, queries, and persistence execute in the browser; the remote side only exchanges changes instead of taking over every local read and write.',
  读写查询先在本地完成: 'Reads, writes, and queries finish locally first',
  '界面、领域逻辑、查询与事务在浏览器内运行。离线时继续读写，联网后再按需同步。':
    'The interface, domain logic, queries, and transactions run in the browser. Reads and writes continue offline, and sync happens when connectivity returns.',
  'UI 与交互层': 'UI and interaction layer',
  '页面、表单与详情视图直接消费本地查询结果，常用读写无需等待网络往返。':
    'Pages, forms, and detail views consume local query results directly, so common reads and writes never wait for a network round trip.',
  本地业务与模型层: 'Local business and model layer',
  '实体规则、关系约束、查询构造与副作用在浏览器里闭环执行。':
    'Entity rules, relation constraints, query construction, and side effects run in a closed loop inside the browser.',
  本地数据库层: 'Local database layer',
  'SQLite 或 PGlite 负责事务、索引与查询，持久化按适配器选择 IndexedDB 或 OPFS。':
    'SQLite or PGlite handles transactions, indexes, and queries, persisting through IndexedDB or OPFS depending on the adapter.',
  '把本地提交、分支状态和需要共享的数据推到远端。':
    'Push local commits, branch state, and the data that needs to be shared to the remote.',
  '拉取远端变更，并合并到本地数据流。': 'Pull remote changes and merge them into the local data stream.',
  交互优先本地执行: 'Local-first interaction',
  '体验不被网络往返拖慢。': 'The experience never waits on a network round trip.',
  版本按分支流转: 'Versions flow through branches',
  '撤销、重做、分支与历史围绕数据版本组织。': 'Undo, redo, branching, and history are organized around data versions.',
  同步按需触发: 'Sync triggers on demand',
  '联网后再 pull / push，本地读写不依赖服务端往返。':
    'Pull / push once back online; local reads and writes do not depend on server round trips.',
  远端同步仓库: 'Remote sync repository',
  '远端充当共享存储或同步中继点，负责交换版本与变更，不替浏览器执行业务主流程。':
    "The remote acts as shared storage or a sync relay that exchanges versions and changes without running the browser's main business flow.",
  保存可共享的版本历史与同步状态: 'Keep shareable version history and sync state',
  为多设备或多成员提供交换点: 'Provide an exchange point for multiple devices or members',
  '通过 pull / push 交换变更，不接管本地业务执行':
    'Exchange changes via pull / push without taking over local business execution',
  核心技术选型: 'Core technology choices',
  '每一层都服务于同一个目标——让数据应用真正跑在浏览器里':
    'Every layer serves one goal: making data applications truly run in the browser',
  本地存储执行层: 'Local storage and execution',
  '提供事务、索引与 SQL 查询，适合多数浏览器端结构化数据场景。':
    'Provides transactions, indexes, and SQL queries for most structured-data scenarios in the browser.',
  '推荐 SQLite 运行时': 'Recommended SQLite runtime',
  '浏览器端 WebAssembly SQLite 实现；默认使用受支持的 IDB 后端，OPFS VFS 需按实验性能力评估。':
    'A WebAssembly SQLite implementation for the browser. It defaults to the supported IDB backend, while the OPFS VFS should be evaluated as an experimental capability.',
  高级查询执行层: 'Advanced query execution',
  '在浏览器内提供 PostgreSQL 兼容能力，适合复杂查询与扩展需求。':
    'Brings PostgreSQL compatibility into the browser for complex queries and extended requirements.',
  模型与类型约束: 'Model and type constraints',
  '约束模型定义、生成代码与消费端 API，在编译期暴露类型错误。':
    'Constrains the model definition, generated code, and consumer APIs, surfacing type errors at compile time.',
  核心响应式主线: 'Core reactive backbone',
  '用 Observable 连接查询结果、变更事件与副作用，构成统一的响应式数据流。':
    'Uses Observables to connect query results, change events, and side effects into one reactive data stream.',
  可选持久化增强: 'Optional persistence upgrade',
  '按适配器和 VFS 的支持等级选择 OPFS；wa-sqlite 默认使用 IDB，不能只凭 API 可用自动切换。':
    'Choose OPFS by adapter and VFS support level. wa-sqlite defaults to IDB and must not switch automatically just because an API is available.',
  代码生成引擎: 'Code generation engine',
  '基于 TypeScript AST，将实体元数据转换为类型、查询构建器与框架适配代码。':
    'Turns entity metadata into types, query builders, and framework adapter code using the TypeScript AST.',
  已落地的能力: 'Capabilities in place',
  '以下能力都可以在文档、demo 和源码里直接验证':
    'Every capability below can be verified directly in the docs, demos, and source code',
  模型驱动开发: 'Model-driven development',
  已实现: 'Implemented',
  '用元数据描述实体，并从模型推导查询、表单与类型约束。':
    'Describe entities with metadata and derive queries, forms, and type constraints from the model.',
  实体元数据: 'Entity metadata',
  关系建模: 'Relation modeling',
  '类型安全 CRUD': 'Type-safe CRUD',
  响应式查询自动更新: 'Reactive query auto-updates',
  '跨框架统一 API': 'One API across frameworks',
  '三个框架共享模型与查询语义，各自保留符合框架习惯的 UI 绑定 API。':
    'All three frameworks share model and query semantics while keeping UI binding APIs that feel native to each framework.',
  'RxJS Observable 通用支持': 'Universal RxJS Observable support',
  代码生成链路: 'Code generation pipeline',
  '从模型定义生成类型与辅助代码，减少重复实现。':
    'Generate types and helper code from the model definition to cut duplicated implementation.',
  完整类型推断: 'Complete type inference',
  查询构建器: 'Query builder',
  实体辅助代码: 'Entity helper code',
  框架封装输出: 'Framework wrapper output',
  性能基础设施: 'Performance infrastructure',
  '通过浏览器内数据库、Worker 与查询缓存划分计算和持久化职责。':
    'Split computation and persistence across the in-browser database, Workers, and query caching.',
  'Worker 支持': 'Worker support',
  'IDB / OPFS 持久化': 'IDB / OPFS persistence',
  查询缓存: 'Query caching',
  'WASM 数据库执行': 'WASM database execution',
  版本与同步基础: 'Versioning and sync foundations',
  'MVP 已验证': 'MVP verified',
  '当前已验证版本分支、撤销重做、条件同步与跨 Tab 同步。':
    'Version branching, undo/redo, conditional sync, and cross-Tab sync have been verified.',
  'Branch 管理': 'Branch management',
  撤销重做: 'Undo / redo',
  '跨 Tab 同步': 'Cross-Tab sync',
  多种同步策略: 'Multiple sync strategies',
  关键代码路径: 'Key code paths',
  '从模型定义到界面订阅，每一步都有明确输入与输出':
    'From model definition to UI subscription, every step has clear inputs and outputs',
  '1. 定义模型边界': '1. Define the model boundary',
  '2. 生成稳定接口': '2. Generate stable interfaces',
  '3. 把查询接入界面': '3. Connect queries to the UI',
  '4. 复用同一套查询语义': '4. Reuse one set of query semantics',
  '三个框架共享模型与查询语义，差异集中在各自的 UI 绑定 API。':
    'All three frameworks share model and query semantics; the differences stay in their UI binding APIs.',
  '# rxdb.config.ts 声明实体文件（entities）与输出目录（outDir），见「客户端生成」文档':
    '# rxdb.config.ts declares the entity files (entities) and the output directory (outDir); see the "Client Generation" docs',
  '# 输出内容包括：': '# Generated output includes:',
  '# - 实体类型与静态类型映射': '# - Entity types and static type mappings',
  '# - Repository 查询方法签名': '# - Repository query method signatures',
  '# - 关系字段的规则类型（支持点语法关系查询）':
    '# - Rule types for relation fields (supports dot-path relation queries)',
  '未完成任务：': 'Incomplete todos:',
  从模型定义开始验证数据链路: 'Verify the data path starting from the model definition',
  '先通过在线演示观察查询、关系与写入如何落地，再结合文档评估存储、框架绑定与同步边界。':
    'Watch how queries, relations, and writes come together in the live demos, then use the docs to evaluate storage, framework binding, and sync boundaries.',
  查看在线演示: 'View live demos',
  'RxDB 是否适合你的项目': 'Is RxDB right for your project?',
  '先核对本地执行、响应式查询和跨框架模型是否对应你的真实需求，再评估引入数据库与 RxJS 的成本。':
    'Check whether local execution, reactive queries, and a cross-framework model match your real needs before weighing the cost of introducing a database and RxJS.',
  '需要浏览器内 SQL 与事务': 'You need in-browser SQL and transactions',
  '数据量、关系和离线编辑已超出接口缓存的承载范围，需要稳定的本地执行层。':
    'Data volume, relations, and offline editing have outgrown API-level caching and need a stable local execution layer.',
  需要订阅查询结果: 'You need to subscribe to query results',
  '查询、数据变更与界面更新需要通过一条响应式链路保持一致。':
    'Queries, data changes, and UI updates must stay consistent through one reactive path.',
  需要统一实体模型: 'You need one unified entity model',
  '类型、查询、关系与生成代码需要围绕实体模型组织，而不是分散在页面中。':
    'Types, queries, relations, and generated code should be organized around the entity model instead of scattered across pages.',
  先确认三个关键需求: 'Confirm three key requirements first',
  '这三个条件越明确，RxDB 带来的收益越容易验证。':
    'The clearer these three conditions are, the easier the benefits of RxDB are to verify.',
  '前端承担复杂业务规则，需要事务、关系查询和可持续演进的本地数据层。':
    'The frontend carries complex business rules and needs transactions, relation queries, and a local data layer that can keep evolving.',
  '多个 Angular、React 或 Vue 应用需要共享模型、查询与写入语义。':
    'Multiple Angular, React, or Vue apps need to share model, query, and write semantics.',
  '应用需要在浏览器内完成复杂查询、离线编辑与关系数据展示。':
    'The app must run complex queries, offline editing, and relation views inside the browser.',
  '只需缓存少量 REST 数据并渲染简单表单，引入数据库与模型层的成本高于收益。':
    'You only cache a little REST data and render simple forms; a database and model layer would cost more than they return.',
  '团队不使用 RxJS，也不接受模型驱动约束，接入成本会明显上升。':
    'The team does not use RxJS and does not accept model-driven constraints, so integration costs would rise sharply.',
  '应用需要开箱即用的托管同步服务、CRDT 多人实时协同或完整的服务端身份与权限体系。':
    'The app needs out-of-the-box hosted sync, CRDT multiplayer collaboration, or a complete server-side identity and permission system.',
  适用场景与不适用场景: 'Where it fits and where it does not',
  适合的场景: 'Where RxDB fits',
  '符合的条件越多，接入收益越清晰。': 'The more conditions you match, the clearer the integration payoff.',
  不适合的情况: 'Where it does not fit',
  '以下场景通常有更轻量或更成熟的方案。': 'These cases usually have lighter or more mature alternatives.',
  当前协作能力边界: 'Current collaboration boundaries',
  '当前已提供版本分支、撤销重做、条件同步、跨 Tab 通知，以及独立的 P2P 认证会话与文件共享。':
    'Version branching, undo/redo, conditional sync, cross-Tab notifications, plus standalone P2P authenticated sessions and file sharing are available today.',
  '实体操作权限可由应用上下文控制；服务端认证、授权与托管同步仍需应用接入，CRDT 多人实时协同尚未提供。':
    'Entity-level permissions can be controlled from the application context; server-side authentication, authorization, and hosted sync still require integration, and CRDT multiplayer collaboration is not provided yet.',
  用在线演示验证关键场景: 'Verify the key scenarios in the live demos',
  '重点观察查询结果如何更新、关系数据如何组织，以及同一模型在三套框架中的绑定差异。':
    'Focus on how query results update, how relation data is organized, and how the same model binds differently across the three frameworks.',
  '根据本地数据库、响应式查询与跨框架模型需求，判断 RxDB 是否适合当前项目':
    'Decide whether RxDB fits your project based on your needs for a local database, reactive queries, and a cross-framework model',
  '执行 SQL': 'Run SQL',
  执行结果: 'Results',
  '正在启动浏览器内 SQLite…': 'Starting in-browser SQLite…',
  '语句执行成功，未返回结果集。': 'The statement ran successfully and returned no result set.',
  '输入 SQL 语句，然后点击执行。': 'Enter a SQL statement, then click Run.'
};

export function siteCopy(value: string, locale: string): string {
  return locale === 'en' ? (englishCopy[value] ?? value) : value;
}

export function useSiteCopy(): (value: string) => string {
  const { i18n } = useDocusaurusContext();
  return useCallback((value: string) => siteCopy(value, i18n.currentLocale), [i18n.currentLocale]);
}
