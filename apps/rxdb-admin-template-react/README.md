# Admin 应用模板孵化

`rxdb-admin-template-react` 在当前 Nx 工作区内孵化为可复用的 Admin 应用模板。它同时承担后台框架的贯穿验证：默认资产样例提供分类、资产和维护记录，保留录入、编辑、筛选、搜索、持久化与备份恢复闭环。

当前交付范围以[应用需求](requirements/README.md)为准。独立仓库模板是长期目标；当前启动和验证均使用本仓库，不提供复制或导出流程。

## 启动与验证

在仓库根目录执行，环境要求沿用根 [package.json](../../package.json) 的 `engines` 与 `packageManager`。

```bash
pnpm install
pnpm nx serve rxdb-admin-template-react
pnpm nx run rxdb-admin-template-react:requirements-check
pnpm nx run rxdb-admin-template-react:requirements-test
pnpm nx run rxdb-admin-template-react:lint --max-warnings=0
pnpm nx run rxdb-admin-template-react:typecheck
pnpm nx run rxdb-admin-template-react:test
pnpm nx run rxdb-admin-template-react:build
pnpm nx run rxdb-admin-template-react-e2e:e2e --workers=2
```

开发服务地址为 `http://127.0.0.1:4206`，配置见 [Vite 配置](vite.config.mts)。浏览器数据保存在本机；恢复备份必须先进入「从备份恢复」，不能先打开实体页面初始化目标库。

`serve` / `dev` 自动构建 HTML 配置使用的后台公共包，首次启动无需手工准备其产物。应用 `test` 同时执行需求结构门禁及门禁测试。

## 定制入口

| 要改什么                                               | 入口                                                                                                        | 约束                                                                     |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 页面标题、描述、品牌、数据库名、偏好前缀、可见命名空间 | [app.config.json](app.config.json)                                                                          | 现有应用的数据库名和存储前缀承载用户数据，变更须另定迁移方案             |
| 样例实体与注册列表                                     | [asset-entities.ts](src/app/entities/asset-entities.ts) 的 `ENTITIES`                                       | 替换关联实体时同步检查关系与 `searchable` 字段；全新业务使用新的数据库名 |
| 可见实体与实体查找                                     | [entity-registry.ts](src/app/entities/entity-registry.ts) 的 `visibleEntityEntries` / `findWorkbenchEntity` | 同一份元数据驱动导航与实体页                                             |
| 自定义页面与路由                                       | [router.tsx](src/app/router.tsx) 的 `routes`                                                                | 页面置于 `src/app/pages/`，沿用懒加载入口                                |
| 菜单及样例图标                                         | [workbench-menu.tsx](src/app/shell/workbench-menu.tsx) 的 `buildWorkbenchMenu`                              | 实体列表仍从注册表派生                                                   |
| 偏好扩展、主题与旧键迁移                               | [workbench-shell.ts](src/app/shell/workbench-shell.ts) 的 `workbenchShell` / `readLegacyPreferences`        | 主题列表与 [styles.css](src/styles.css) 中 daisyUI 主题保持一致          |
| 本地数据库与插件                                       | [setup_rxdb.ts](src/app/rxdb/setup_rxdb.ts)                                                                 | 当前使用 sqlite-wasm 主线程 + IndexedDB，搜索和备份依赖此组合            |

实体替换与页面扩展尚待完整的新业务验收，分别见 [ADMIN-US-101](requirements/stories/domain/ADMIN-US-101-replace-sample-domain.md) 和 [ADMIN-US-102](requirements/stories/domain/ADMIN-US-102-custom-pages-navigation.md)。不能仅替换 `ENTITIES` 就宣称整个应用已经摆脱资产样例。

## 国际化

应用通过一个 `@aiao/rxdb-i18n` 运行时与 `@aiao/rxdb-i18n-react` provider 共享中英文状态。目录包含 `rxdb-admin` 外壳、`rxdb-model` 模型组件及应用的 `workbench` 命名空间；自有目录集中在 `src/app/i18n/`。顶栏语言按钮更新外壳 `app.locale`，既有偏好存储负责刷新恢复与同源跨 Tab 通知。

标题、描述、品牌、导航、已打开页签、搜索、备份恢复、无障碍文案和实体显示名随语言更新。模型组件默认中文目录来自 `modelMessages`，英文显式注册 `modelEnMessages`；扩展实体时，应同步补齐实体、属性及关系的中英文显示名。用户输入与已存记录保持原值，包括资产默认状态「在用」。

应用标识的英文版本配置在 `app.config.json` 的 `locales.en`。实体显示目录位于 `domain-messages.ts`，使用 `rxdb-model` 命名空间：实体名为 `entity.<namespace>.<entity>.displayName`，字段为 `entity.<namespace>.<entity>.property.<field>`，关系为 `entity.<namespace>.<entity>.relation.<relation>`。这些 key 只控制显示，原始 schema 仍声明默认显示名。

这里使用静态目录运行时，语言偏好不写入业务数据库，也不调用持久化 i18n 的 `init()`。因此在首页或「从备份恢复」页切换语言、刷新、跨 Tab 更新，均不会提前初始化空工作台，备份恢复仍遵守先恢复再连接的约束。远端目录与业务内容多语言翻译不属于当前接入范围。

验收范围见 [ADMIN-US-003](requirements/stories/platform/ADMIN-US-003-client-i18n.md)，真实浏览器用例见 [i18n.spec.ts](../rxdb-admin-template-react-e2e/src/i18n.spec.ts)。

## 能力边界

这是单人、本地优先的 Web 应用。当前 `userId` 是应用上下文，锁屏属于本机交互；账号认证、服务端授权、多用户隔离和跨设备协作需要独立设计与验收。公共包继续遵守 Angular / React / Vue API 对称要求，本应用目前使用 React。

平台后台能力由根 [epic-010](../../requirements/epics/epic-010-model-driven-admin-framework.md) 管理；应用产品范围、定制体验与验收在本应用独立管理。
