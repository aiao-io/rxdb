# 候选领域：模型驱动后台管理框架（Admin 生成器）

> 本文是候选领域分析，不是用户故事，不参与状态统计。状态与维护规则见
> [本目录 README](README.md)。

2026-10-18 [优先级复核](priority-review-2026-10-18.md)建议先做**给定实体 schema 的单人 Web 本地数据工作台**。
下文是早期能力映射：现有权限是实体操作约束，生成器输出实体代码；多用户后台、完整应用生成和跨宿主 UI
仍需额外实现，首版范围与证据以该评审为准。

**一句话结论**：后台管理 = 看数据 + 提交数据的重复劳动；把 `EntityMetadata` 作为唯一真相源，
从同一份 schema 派生表单、表格、查询构建器、校验、权限与审计——`rxdb-model` 四包与 demo 的
实体页面已是半成品，本候选是全场立项门槛最低的候选。与
[ai-native-builder](ai-native-builder.md) 是兄弟：一个确定性生成、一个 AI 生成。
生成物默认跨宿主：同一份 admin 应用跑 Web / Electron / Tauri / 小程序（实验性），桌面端首选 Tauri。

**对标产品**：react-admin / refine（React 系，绑 REST/GraphQL 后端）；AdminJS（Node 系）；
vben admin / ng-alain / Ant Design Pro（框架模板系）；Airtable（数据表格 UX 标杆）。
本地优先 admin 框架目前是市场空白。

## 契合点：现有能力逐项映射

| 产品功能                  | 引擎现有能力                                                                    | 出处                                                                                                                                                                                                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 列表 / 分页 / 筛选 / 统计 | useFind / useFindByCursor / useCount + InfiniteScroll，响应式即时刷新           | [capability-matrix](../capability-matrix.md) 跨框架矩阵                                                                                                                                                                                                                 |
| 中文搜索                  | FTS5 + CJK bigram（`useSearch`）——列表搜索零成本                                | [US-702](../stories/future/US-702-full-text-search.md)                                                                                                                                                                                                                  |
| 表单三模式 + 校验         | `rxdb-model` entity-form（create / edit / view）+ 字段校验                      | `@aiao/rxdb-model` 包                                                                                                                                                                                                                                                   |
| 可编辑表格                | `rxdb-model` entity-table（VTable 15 种编辑器、剪贴板 / 键盘 / 拖拽重排）       | `@aiao/rxdb-model` 包                                                                                                                                                                                                                                                   |
| 可视化查询构建器          | `rxdb-model` query-builder（操作符注册表、即时校验、`toRxDBQuery`）             | `@aiao/rxdb-model` 包                                                                                                                                                                                                                                                   |
| 数据库层校验              | 声明式约束 CHECK / 条件唯一 / 区间排他——同一份 schema，前后端校验不写两遍       | [US-030](../stories/core/US-030-declarative-storage-constraints.md)                                                                                                                                                                                                     |
| 权限                      | 实体操作权限模型（行级）                                                        | [US-027](../stories/core/US-027-entity-permission-model.md)                                                                                                                                                                                                             |
| 审计（谁改了什么）        | working-tree commit graph——提交即 commit，带作者 / 时间 / 消息、可 diff、可回滚 | [epic-006](../epics/epic-006-working-tree-commits.md)                                                                                                                                                                                                                   |
| 菜单树 / 组织树           | 树插件（单父邻接表），GeneratorPage 已内置 Menu 实体 demo                       | [capability-matrix](../capability-matrix.md) · apps/dev-rxdb-vue GeneratorPage                                                                                                                                                                                          |
| 骨架生成                  | demo GeneratorPage 已能从 `EntityMetadata` 生成源码 zip                         | apps/dev-rxdb-vue GeneratorPage                                                                                                                                                                                                                                         |
| 离线 / 多端 / 备份        | 本地 SQLite + 同步适配器 + 一致性备份                                           | [epic-002](../epics/epic-002-data-sync.md) · [US-217](../stories/adapter/US-217-local-database-backup-restore.md)                                                                                                                                                       |
| 生成物多宿主部署          | Web / Electron / Tauri / 小程序适配器——同一份应用，静态托管或桌面打包           | [US-207](../stories/adapter/US-207-desktop-local-database.md) · [US-208](../stories/adapter/US-208-electron-pglite-data-directory.md) · [US-210](../stories/adapter/US-210-tauri-sqlite-local-database.md) · [US-209](../stories/adapter/US-209-miniprogram-adapter.md) |

## 生成物跨宿主（Web / 桌面 / 小程序）

同一份 admin 应用，三框架任选 + 多宿主部署：

- **Web**：静态托管单机版（零后端可交付），需要服务端时挂 Supabase / HTTP 适配器
- **桌面（首选 Tauri）**：rusqlite 原生 SQLite（[US-210](../stories/adapter/US-210-tauri-sqlite-local-database.md)
  已交付）、包体小不捆 Chromium、宿主文件系统为将来附件能力（vision 阶段 5）留口；
  dev-rxdb-tauri demo 已跑通（devtools-smoke / desktop-smoke）
- **桌面（Electron 备选）**：SQLite（node:sqlite host）与 PGlite 双路线均已交付
  （[US-207](../stories/adapter/US-207-desktop-local-database.md) · [US-208](../stories/adapter/US-208-electron-pglite-data-directory.md)）
- **小程序（实验性）**：微信 / 抖音 / 支付宝逻辑层（[US-209](../stories/adapter/US-209-miniprogram-adapter.md) ·
  [US-211](../stories/adapter/US-211-multi-miniprogram-platforms.md)），Taro 构建插件
  （[US-219](../stories/adapter/US-219-taro-plugin.md)）

## 引擎缺口

- **多人同时编辑同一记录**：实时协作是 [vision](../vision.md) 阶段 3 的方向（不是承诺）
- **附件上传**：vision 阶段 5 方向

## 引擎外成本

- VTable（`@visactor/vtable`）组件库——已是 `rxdb-model` 的 peer 依赖，不算新增
- **无 LLM、无编译器沙箱**——全场引擎外成本最低的候选

## 与兄弟候选的关系

- **[ai-native-builder](ai-native-builder.md)**：本候选是其「低代码数据应用」形态的确定性
  版本——AI 生成器走的是同一个 `rxdb-model` 生成路径；本候选不需要 LLM
- 其余候选不重叠：本候选是开发者工具向，不是终端产品领域

## 立项前置

无硬前置：`rxdb-model` 四包已交付、demo 实体列表 / 详情页已跑通（含 TDD spec）。唯一工作是
产品化组装——布局 / 导航 / 权限接线 / 生成器模板打磨。

## 入场条件（什么信号才值得立项）

出现具名团队的「今天踩得到」的具体症状，例如：

- 已有团队报告「又一个 CRUD 系统要写」——列表 + 表单 + 权限 + 审计的重复劳动出现第三遍
- 或自举：仓库自己的 requirements / roadmap / status-overview 改用本框架管理
  （story 实体、状态机、批次排期），内部工具即活 demo
