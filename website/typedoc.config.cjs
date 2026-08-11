// @ts-check
/** @type {Partial<import('typedoc').TypeDocOptions>} */
module.exports = {
  // ============================================
  // 输入和入口点配置
  // ============================================
  entryPoints: [
    // 核心
    '../packages/rxdb',
    // 适配器
    '../packages/rxdb-adapter-wa-sqlite',
    '../packages/rxdb-adapter-pglite',
    '../packages/rxdb-adapter-supabase',
    '../packages/rxdb-adapter-sqlite',
    '../packages/rxdb-adapter-sqlite-core',
    '../packages/rxdb-adapter-sqlite-wasm',
    '../packages/rxdb-adapter-sqliteai',
    '../packages/rxdb-adapter-encrypted',
    // 框架集成
    '../packages/rxdb-angular',
    '../packages/rxdb-react',
    '../packages/rxdb-vue',
    // 插件
    '../packages/rxdb-plugin-graph',
    '../packages/rxdb-plugin-workspace',
    '../packages/rxdb-plugin-storage',
    '../packages/rxdb-plugin-search',
    '../packages/rxdb-plugin-search-angular',
    '../packages/rxdb-plugin-search-react',
    '../packages/rxdb-plugin-search-vue',
    // 代码编辑器
    '../packages/code-editor',
    '../packages/code-editor-angular',
    '../packages/code-editor-react',
    '../packages/code-editor-vue',
    // 工具与开发者工具
    '../packages/rxdb-client-generator',
    '../packages/rxdb-devtools',
    '../packages/utils'
    // 说明：rxdb-test 为测试夹具/套件包（供消费者编写测试），非产品公开 API，
    // 故不纳入 API 参考以避免噪音。
  ],
  entryPointStrategy: 'packages',
  tsconfig: '../tsconfig.typedoc.json',

  // packages 策略下，TypeDoc 会在每个包目录内运行并合并结果。
  // 统一以 src/index.ts 作为入口，避免依赖各包 package.json 的 exports/main 字段。
  // 这修复了 ng-packagr 类 Angular 包（源 package.json 无入口字段）仅生成 README 的问题，
  // 且不需要手工改动 Angular 发布 manifest。
  // 注意：不要在此覆盖 tsconfig —— 让每个包使用自身作用域内的 tsconfig.json，
  // 否则会退回到未限定范围的根 tsconfig，把 benchmarks/dist 等压缩产物拉进程序导致崩溃。
  packageOptions: {
    entryPoints: ['src/index.ts']
  },

  // ============================================
  // 输出配置（插件特定）
  // ============================================
  out: './docs/api',
  plugin: ['typedoc-plugin-markdown'],
  // 路由器：'member' 为每个成员类型生成单独文件
  // 替代方案：'module' 为每个模块创建单个文件（更扁平的结构）
  router: 'member',

  // ============================================
  // 文件选项（typedoc-plugin-markdown）
  // ============================================
  // 使用 .md 而不是 .mdx 以避免模板字面量类型的 JSX 解析问题
  // MDX 将 {} 视为 JSX 表达式，这会破坏 TypeScript 模板字符串如 `${string}`
  fileExtension: '.md',

  // 使用 'README' 让 GitHub 目录浏览时自动展示入口文档
  entryFileName: 'README',

  // 不要将 readme 与 index 合并（保持分离）
  mergeReadme: false,
  // ============================================
  // 通用文档选项
  // ============================================
  name: 'Aiao API Documentation',
  readme: 'none',
  excludePrivate: true,
  excludeProtected: false,
  excludeExternals: true,
  excludeInternal: true,
  exclude: ['**/*.spec.ts', '**/*.test.ts', '**/__tests__/**/*', '**/test-utils.ts'],

  // ============================================
  // 显示选项（typedoc-plugin-markdown）
  // ============================================
  hidePageHeader: true,
  hideBreadcrumbs: true, // 隐藏面包屑以避免损坏的 ../README.md 链接
  hidePageTitle: false,

  // 将签名包装在代码块中以提高可读性
  useCodeBlocks: true,

  // 默认折叠对象（更清洁的输出）
  expandObjects: false,
  expandParameters: false,

  // ============================================
  // 格式选项（typedoc-plugin-markdown v4+）
  // ============================================
  // 为属性使用 'list' 格式以避免表格中代码示例的 MDX 问题
  // 表格格式无法处理 @example 标签中的多行代码块
  parametersFormat: 'table',
  interfacePropertiesFormat: 'list', // 从 'table' 更改
  classPropertiesFormat: 'list', // 从 'table' 更改
  typeAliasPropertiesFormat: 'table',
  // enum 成员改用 'list':表格行内的锚点固定是裸 <a id="..."> 标签(member.enumMembersTable.js
  // 不受 useCustomAnchors 控制),Docusaurus 的 onBrokenAnchors 不识别这类标签。
  // 'list' 会让每个成员走标题渲染路径,从而享受 useCustomAnchors 生成的 {#anchor} 语法。
  enumMembersFormat: 'list',
  propertyMembersFormat: 'list', // 从 'table' 更改
  typeDeclarationFormat: 'table',
  indexFormat: 'table',

  // ============================================
  // 排序和组织
  // ============================================
  sort: ['source-order', 'required-first', 'kind'],
  kindSortOrder: ['Function', 'Class', 'Interface', 'TypeAlias', 'Variable', 'Enum', 'EnumMember'],

  // ============================================
  // 导航配置
  // ============================================
  navigation: {
    includeCategories: true,
    includeGroups: true,
    includeFolders: false
  },

  // ============================================
  // 实用选项（MDX/Docusaurus 兼容性）
  // ============================================
  // 对 MDX 至关重要：编码尖括号以避免 JSX 解析错误
  useHTMLEncodedBrackets: true,

  // 清理注释以转义 <, >, {, } 字符
  sanitizeComments: true,

  // 注意：不要用 useHTMLAnchors —— 它只生成裸 <a id="..."> 标签，
  // Docusaurus 的 onBrokenAnchors 检查器只认可由标题文本推导出的锚点，
  // 不识别这种嵌入式 HTML 标签，导致有歧义后缀（如 #id-1）的跨包链接被误判为 broken。
  // 改用带转义大括号的自定义锚点，这样 Docusaurus 会把 {#id-1} 当作真正的标题 ID 注册。
  useCustomAnchors: true,
  customAnchorsFormat: 'escapedCurlyBrace',

  // ============================================
  // 性能和构建选项
  // ============================================
  skipErrorChecking: false,

  // 构建前清理输出目录
  cleanOutputDir: true
};
