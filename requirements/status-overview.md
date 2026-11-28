# 状态概览

> **真相源**：每个 story 的 YAML `status`。本文件是派生视图；发现冲突时先修正故事的证据与状态，再同步视图。
> 排期见 [roadmap](roadmap.md)，能力见 [capability-matrix](capability-matrix.md)，发布见 [release-plan](release-plan.md)。
> 汇总表、进行中 / 待评审 / 阻塞三节与按 Epic 索引的故事列表由 `pnpm audit:requirements:update` 生成，手改会被覆盖；索引各小节标题下的说明文字是手写的。

## 状态汇总

| 状态           | 数量 |
| :------------- | :--- |
| ✅ Done        | 120  |
| 🚧 In Progress | 13   |
| 👀 In Review   | 3    |
| 📝 Backlog     | 34   |
| 🚫 Blocked     | 0    |
| **合计**       | 170  |

统计只包含带 story frontmatter 的文件。辅助证据和无故事文件的候选不计数；同编号的辅助文件不算另一条故事。
Backlog 包含已授权和价值待证范围；候选阶段不因当前范围关闭而自动通过。当前可开工条件见 roadmap 与各故事的阶段表。

## 进行中（13 条）

- [US-211 多端小程序宿主（支付宝 / 抖音 / 百度 / QQ）](stories/adapter/US-211-multi-miniprogram-platforms.md)：未通过 AC#9、#14、#16、#18（4/21）
- [US-403 实体组件 Headless API 与可定制展示层](stories/ui/US-403-entity-components-headless.md)：未通过 AC#1～#16、#18～#21（20/21）
- [US-530 后台外壳偏好中心：声明式 schema 驱动的偏好抽屉与外观设置](stories/domain/US-530-admin-shell-preferences-appearance.md)：未通过 AC#1～#7（7/7）
- [US-531 后台外壳布局：四种布局模式、侧栏图标轨、移动端抽屉与页签栏](stories/domain/US-531-admin-shell-layout-tabbar.md)：未通过 AC#1～#7（7/7）
- [US-532 后台外壳快捷键、命令面板与扩展偏好项](stories/domain/US-532-admin-shell-shortcuts-palette-extensions.md)：未通过 AC#1～#6（6/6）
- [US-533 后台外壳顶栏部件、锁屏与通用设置：语言、时区、水印、版权页脚](stories/domain/US-533-admin-shell-widgets-lock-general.md)：未通过 AC#1～#7（7/7）
- [US-537 重开恢复与备份导出](stories/domain/US-537-board-backup-restore.md)：未通过 AC#9（1/10）
- [US-540 看板端到端 demo：一份数据集走完全域](stories/domain/US-540-board-end-to-end-demo.md)：未通过 AC#7、#12（2/13）
- [US-603 手工发布入口的提交与校验结果一致性](stories/tooling/US-603-manual-release-preflight.md)：未通过 AC#1～#6（6/6）
- [US-704 文件清单与 P2P 发现](stories/future/US-704-p2p-manifest-discovery.md)：未通过 AC#2、#4、#5、#7、#8（5/9）
- [US-705 P2P 字节传输](stories/future/US-705-p2p-byte-transfer.md)：未通过 AC#1～#8（8/8）
- [US-706 服务器兜底与认证](stories/future/US-706-p2p-fallback-auth.md)：未通过 AC#3～#5（3/6）
- [US-707 跨运行时 demo 与多实例 e2e](stories/future/US-707-p2p-cross-runtime-e2e.md)：未通过 AC#4～#8（5/8）

## 待评审（3 条）

- [US-018 生成器元数据序列化管线与 default 语义](stories/core/US-018-generator-default-serialization.md)：未通过 AC#10（1/10）
- [US-219 Taro 插件一行接入小程序 adapter 的构建配置](stories/adapter/US-219-taro-plugin.md)：未通过 AC#9、#10、#17（3/17）
- [US-713 P2P demo 管理后台：管理员总览并处置账号与服务](stories/future/US-713-p2p-admin-console.md)：未通过 AC#11（1/11）

## 阻塞（0 条）

当前没有 YAML 显式标为 Blocked 的故事；不等于其他故事没有前置。

## 按 Epic 索引

### [核心 MVP 功能](epics/epic-001-core-mvp.md)

- ✅ [US-001 定义数据模型](stories/core/US-001-model-definition.md)
- ✅ [US-002 客户端代码生成](stories/core/US-002-client-generation.md)
- ✅ [US-003 数据查询](stories/core/US-003-data-query.md)
- ✅ [US-004 数据变更](stories/core/US-004-data-mutation.md)
- ✅ [US-005 关系映射](stories/core/US-005-relationship-mapping.md)
- ✅ [US-006 响应式查询](stories/core/US-006-reactive-queries.md)
- ✅ [US-007 变更追踪](stories/core/US-007-change-tracking.md)
- ✅ [US-008 事务支持](stories/core/US-008-transaction-support.md)
- ✅ [US-009 跨 Tab 数据同步](stories/core/US-009-cross-tab-sync.md)
- ✅ [US-010 树形数据结构](stories/core/US-010-tree-entity.md)
- ✅ [US-101 Angular 集成](stories/framework/US-101-angular-integration.md)
- ✅ [US-102 React 集成](stories/framework/US-102-react-integration.md)
- ✅ [US-103 Vue 集成](stories/framework/US-103-vue-integration.md)
- ✅ [US-201 SQLite 适配器](stories/adapter/US-201-sqlite-adapter.md)
- ✅ [US-202 PGlite 适配器](stories/adapter/US-202-pglite-adapter.md)
- ✅ [US-204 SQLite WASM 适配器（subframe / official）](stories/adapter/US-204-sqlite-wasm-adapter.md)
- ✅ [US-205 SQLiteAI 适配器（向量与 AI 能力）](stories/adapter/US-205-sqliteai-adapter.md)
- ✅ [US-501 Workspace 插件](stories/plugin/US-501-workspace-plugin.md)
- ✅ [US-502 Storage 插件](stories/plugin/US-502-storage-plugin.md)
- ✅ [US-503 图数据插件](stories/plugin/US-503-graph-data.md)

### [数据同步与协作](epics/epic-002-data-sync.md)

- ✅ [US-203 Supabase 远程适配器](stories/adapter/US-203-supabase-adapter.md)
- ✅ [US-301 版本控制](stories/collaboration/US-301-version-control.md)
- ✅ [US-302 撤销/重做](stories/collaboration/US-302-undo-redo.md)
- ✅ [US-803 本地字段级加密 MVP](stories/future/US-803-local-encryption.md)

### [UI 组件与开发者工具](epics/epic-003-ui-developer-tools.md)

- ✅ [US-402 代码编辑器组件](stories/ui/US-402-code-editor.md)
- 🚧 [US-403 实体组件 Headless API 与可定制展示层](stories/ui/US-403-entity-components-headless.md)
- ✅ [US-902 DevTools 面板](stories/future/US-902-devtools-panel.md)
- ✅ [US-904 DevTools 原生本地存储调试](stories/future/US-904-devtools-native-storage-contract.md)
- ✅ [US-905 Tauri DevTools 调试窗口、transport 与原生存储集成](stories/future/US-905-tauri-native-devtools.md)
- ✅ [US-906 Electron 桌面端 DevTools 面板的开发者可用路径](stories/future/US-906-electron-devtools-developer-path.md)
- ✅ [US-908 DevTools 传输取消与桌面文件会话的两条已知缺陷](stories/future/US-908-devtools-transfer-session-defects.md)

### [未来功能](epics/epic-004-future-features.md)

- ✅ [US-020 将 QueryCache 接入统一 Repository](stories/core/US-020-querycache-repository.md)
- ✅ [US-021 QueryCache 远端适配器缺席时配置期 fail-fast](stories/core/US-021-querycache-adapter-fail-fast.md)
- ✅ [US-022 QueryCache 远端行的列契约与缺列诊断](stories/core/US-022-querycache-remote-row-contract.md)
- ✅ [US-023 QueryCache 远端变更的失效上报口与实时同步](stories/core/US-023-querycache-remote-invalidation.md)
- ✅ [US-024 PGlite 侧 QueryCache 远端行的列契约](stories/core/US-024-pglite-querycache-row-contract.md)
- ✅ [US-025 核心包子系统按插件边界外移](stories/core/US-025-core-plugin-extraction.md)
- ✅ [US-026 实例级实体同步配置覆盖](stories/core/US-026-instance-sync-override.md)
- ✅ [US-027 实体操作权限模型](stories/core/US-027-entity-permission-model.md)
- ✅ [US-028 可排序实体（普通实体手动排序）](stories/core/US-028-sortable-entity.md)
- ✅ [US-030 实体元数据层的声明式存储约束](stories/core/US-030-declarative-storage-constraints.md)
- ✅ [US-031 树形实体迁移到排序模块](stories/core/US-031-tree-sortable-migration.md)
- ✅ [US-032 跨 Tab 增量 UPDATE 的活查询刷新](stories/core/US-032-cross-tab-update-live-query.md)
- ✅ [US-037 全量推送按外键依赖排序：子实体声明在前时不再被拒并删掉本地行](stories/core/US-037-push-order-by-foreign-key.md)
- ✅ [US-038 双向一对一的实体能开同步：同步层按可空外键断环](stories/core/US-038-bidirectional-one-to-one-sync.md)
- ✅ [US-104 rxdb-model 表单校验反馈与保存失败的展示（三端对称）](stories/framework/US-104-validation-feedback.md)
- ⬜ [US-105 rxdb-model 表单字段错误提示与保存失败归因（三端对称）](stories/framework/US-105-form-field-error-feedback.md)
- ✅ [US-207 Electron 连接本地 SQLite 文件](stories/adapter/US-207-desktop-local-database.md)
- ✅ [US-208 Electron PGlite 数据目录与事务宿主](stories/adapter/US-208-electron-pglite-data-directory.md)
- ✅ [US-209 微信小程序 wa-sqlite 适配器](stories/adapter/US-209-miniprogram-adapter.md)
- ✅ [US-210 Tauri 连接应用作用域 SQLite 文件](stories/adapter/US-210-tauri-sqlite-local-database.md)
- 🚧 [US-211 多端小程序宿主（支付宝 / 抖音 / 百度 / QQ）](stories/adapter/US-211-multi-miniprogram-platforms.md)
- ✅ [US-212 HTTP 远程适配器](stories/adapter/US-212-http-adapter.md)
- ✅ [US-213 HTTP 适配器 wire 级端到端集成测试（真实 node 后端）](stories/adapter/US-213-http-wire-integration-test.md)
- ✅ [US-214 HTTP 适配器浏览器端到端 demo（Angular 前端 + RxDB/PGlite 参考后端）](stories/adapter/US-214-http-browser-demo.md)
- ✅ [US-215 条件请求被静默停用时给出可观测信号](stories/adapter/US-215-conditional-request-silence.md)
- ✅ [US-216 参考后端以 RxDB 引擎实现：后端可初始化 RxDB、前后端共享 schema 与查询逻辑](stories/adapter/US-216-server-side-rxdb.md)
- ✅ [US-217 本地数据库一致性备份与恢复](stories/adapter/US-217-local-database-backup-restore.md)
- ✅ [US-218 Supabase 远端启用 RLS 时的推送完整性](stories/adapter/US-218-supabase-rls-push-integrity.md)
- 👀 [US-219 Taro 插件一行接入小程序 adapter 的构建配置](stories/adapter/US-219-taro-plugin.md)
- ✅ [US-220 Supabase 推送 UPDATE 的落库语义](stories/adapter/US-220-supabase-update-push-semantics.md)
- ✅ [US-221 OPFS 库在整页刷新后偶发打不开：上一个页面还占着同步访问句柄](stories/adapter/US-221-opfs-reload-access-handle-race.md)
- ✅ [US-223 Supabase 直写路径的 UPDATE 落库语义](stories/adapter/US-223-supabase-mutations-update-semantics.md)
- ✅ [US-224 Supabase 推送路径上级联删除的子行不写变更日志](stories/adapter/US-224-supabase-cascade-delete-change-log.md)
- ✅ [US-225 Supabase 日志同步只对已登录身份开放，非 main 分支按所有者写入](stories/adapter/US-225-supabase-sync-protocol-access-baseline.md)
- ⬜ [US-226 Supabase 待拉数按记录计：一个事务一条](stories/adapter/US-226-supabase-pull-count-records.md)
- ✅ [US-227 dev-rxdb-supabase 关系数据的推拉同步演示与端到端验收](stories/adapter/US-227-supabase-relational-sync-demo.md)
- ✅ [US-228 多对多关联在 Supabase 上可同步：中间表按实体形状建表，关联行 id 由两端确定](stories/adapter/US-228-supabase-many-to-many-sync.md)
- ✅ [US-504 Electron 本地文件存储](stories/plugin/US-504-electron-local-file-storage.md)
- ✅ [US-505 Tauri 本地文件存储](stories/plugin/US-505-tauri-local-file-storage.md)
- ✅ [US-506 website 插件文档补齐（history / sync / querycache）](stories/plugin/US-506-website-plugin-docs.md)
- ✅ [US-702 全文搜索](stories/future/US-702-full-text-search.md)
- ✅ [US-703 PGlite 全文搜索](stories/future/US-703-pglite-full-text-search.md)
- ✅ [US-909 会话录制回放与失败现场数据还原](stories/future/US-909-session-replay-debugging.md)
- ⬜ [US-910 数据国际化 / 本地化（多语言实体翻译）](stories/future/US-910-data-i18n.md)
- ✅ [US-911 客户端国际化 / 本地化（UI 文案与 locale 状态）](stories/future/US-911-client-i18n.md)

### [类型系统演进](epics/epic-005-type-system-evolution.md)

- ✅ [US-011 定义 bigint 与 binary 类型及公共 API 契约](stories/core/US-011-property-type-bigint-binary.md)
- ✅ [US-012 扩展字段语义与前端通信契约](stories/core/US-012-field-semantic-metadata.md)
- 👀 [US-018 生成器元数据序列化管线与 default 语义](stories/core/US-018-generator-default-serialization.md)
- ✅ [US-019 拒绝重复声明的 URL scheme](stories/core/US-019-url-scheme-duplicate-rejection.md)
- ✅ [US-206 本地适配器持久化与查询 bigint/binary](stories/adapter/US-206-bigint-binary-adapter.md)
- ✅ [US-303 bigint/binary change codec 与系统迁移](stories/collaboration/US-303-bigint-binary-change-codec.md)
- ✅ [US-804 加密字段支持 bigint/binary](stories/future/US-804-bigint-binary-encryption.md)
- ✅ [US-903 DevTools 展示 bigint/binary](stories/future/US-903-bigint-binary-devtools.md)

### [本地工作树与提交历史](epics/epic-006-working-tree-commits.md)

- ✅ [US-222 删分支之后按活查询列分支的地方不刷新：`log: false` 的实体删行派不出本地事件](stories/adapter/US-222-unlogged-entity-delete-live-query.md)
- ✅ [US-305 提交图与 HEAD 持久化](stories/collaboration/US-305-commit-graph-head.md)
- ✅ [US-306 工作树与提交操作](stories/collaboration/US-306-working-tree-commits.md)
- ✅ [US-307 历史恢复会话](stories/collaboration/US-307-restore-session.md)
- ✅ [US-308 分支隔离与跨 realm 冲突检测](stories/collaboration/US-308-branch-isolation-conflict.md)
- ✅ [US-311 不写变更日志的实体与插件系统表退出草稿缓存与版本化域](stories/collaboration/US-311-unlogged-entities-scope.md)
- ✅ [US-312 不切换分支就对比两条分支、预览一次合并（含覆盖标注）](stories/collaboration/US-312-branch-compare-merge-preview.md)
- ✅ [US-313 只读检出位：不切换分支就打开另一条分支或一个可达提交的完整数据](stories/collaboration/US-313-read-only-checkout.md)
- ✅ [US-314 可写检出位与从提交建分支：对齐 GitHub Desktop 3.6 的 worktree](stories/collaboration/US-314-writable-worktrees.md)
- ✅ [US-315 撤销子分支已继承的变更之后，切回父分支写错数据](stories/collaboration/US-315-undo-inherited-change-switch-corruption.md)

### [公开 API 门禁](epics/epic-007-public-api-gates.md)

- ✅ [US-601 子路径入口纳入 API 表面基线](stories/tooling/US-601-subpath-api-surface-baseline.md)
- ✅ [US-602 发布产物面向 AI 的可理解性](stories/tooling/US-602-ai-comprehensible-artifacts.md)
- 🚧 [US-603 手工发布入口的提交与校验结果一致性](stories/tooling/US-603-manual-release-preflight.md)

### [生命周期作用域](epics/epic-008-lifecycle-scope.md)

- ✅ [US-013 LifecycleScope 生命周期作用域原语](stories/core/US-013-lifecycle-scope-primitive.md)
- ✅ [US-014 插件作用域契约](stories/core/US-014-plugin-scope-contract.md)
- ✅ [US-015 插件依赖声明与按需装卸](stories/core/US-015-plugin-inject-dependency.md)

### [BOM 领域模型](epics/epic-009-bom-domain-model.md)

- ⬜ [US-507 BOM 图骨架：物料、修订与多重边 BOM 行](stories/domain/US-507-bom-graph-skeleton.md)
- ⬜ [US-508 BOM 视图解析：类型/组织/修订/生效期过滤](stories/domain/US-508-bom-view-resolution.md)
- ⬜ [US-509 DAG 约束与环路检测下沉存储层](stories/domain/US-509-bom-dag-cycle-detection.md)
- ⬜ [US-510 多级展开与 where-used 反查](stories/domain/US-510-bom-multilevel-explosion.md)
- ⬜ [US-511 展开数量正确性：用量语义、三类损耗、虚拟件穿透](stories/domain/US-511-bom-quantity-semantics.md)
- ⬜ [US-512 替代组与替代策略](stories/domain/US-512-bom-substitute-group.md)
- ⬜ [US-513 联产品与副产品：多输出物料流](stories/domain/US-513-bom-coproduct-byproduct.md)
- ⬜ [US-514 成本卷算](stories/domain/US-514-bom-cost-rollup.md)
- ⬜ [US-515 变更管理（ECN）驱动的生效期](stories/domain/US-515-bom-change-management.md)
- ⬜ [US-516 EBOM ↔ MBOM 映射与差异对比](stories/domain/US-516-ebom-mbom-mapping.md)
- ⬜ [US-517 可配置销售 BOM：特征、选项与选择条件](stories/domain/US-517-configurable-sales-bom.md)
- ⬜ [US-518 序列与批次有效性](stories/domain/US-518-bom-unit-lot-effectivity.md)
- ⬜ [US-519 扩展属性：jsonb 值 + attr_def 元数据 + 热字段提升](stories/domain/US-519-bom-extension-attributes.md)
- ⬜ [US-520 工艺路线挂接与工序投料分摊](stories/domain/US-520-bom-routing-operation.md)
- ⬜ [US-521 ERP/MRP 集成契约](stories/domain/US-521-bom-erp-mrp-integration.md)
- ⬜ [US-522 三框架 BOM 编辑与展开视图](stories/domain/US-522-bom-tri-framework-ui.md)
- ⬜ [US-523 as-built / as-maintained 实例 BOM](stories/domain/US-523-bom-as-built-instance.md)
- ⬜ [US-524 工艺路线本体：工序、工作中心、工时与费率](stories/domain/US-524-routing-master-model.md)
- ⬜ [US-525 BOM 端到端 demo：一份数据集走完全域](stories/domain/US-525-bom-end-to-end-demo.md)

### [模型驱动后台管理框架](epics/epic-010-model-driven-admin-framework.md)

- ✅ [US-526 模型驱动数据工作台：预置 schema 的录入 / 编辑 / 筛选闭环](stories/domain/US-526-admin-workbench.md)
- ✅ [US-527 工作台备份恢复闭环：失败语义与数据保留](stories/domain/US-527-admin-backup-restore.md)
- ⬜ [US-528 独立消费接入示例与接入成本记录](stories/domain/US-528-admin-consumer-example.md)
- ✅ [US-529 实体列表视图配置：字段显隐、多字段排序与分组](stories/domain/US-529-entity-list-view-settings.md)
- 🚧 [US-530 后台外壳偏好中心：声明式 schema 驱动的偏好抽屉与外观设置](stories/domain/US-530-admin-shell-preferences-appearance.md)
- 🚧 [US-531 后台外壳布局：四种布局模式、侧栏图标轨、移动端抽屉与页签栏](stories/domain/US-531-admin-shell-layout-tabbar.md)
- 🚧 [US-532 后台外壳快捷键、命令面板与扩展偏好项](stories/domain/US-532-admin-shell-shortcuts-palette-extensions.md)
- 🚧 [US-533 后台外壳顶栏部件、锁屏与通用设置：语言、时区、水印、版权页脚](stories/domain/US-533-admin-shell-widgets-lock-general.md)

### [任务看板领域模型](epics/epic-011-task-board-domain-model.md)

单人范围 US-534～US-540 已获 owner 授权；US-541 团队版保留价值待证。
当前排期与准入见 [roadmap 批次 6](roadmap.md#批次-6看板首轮切片epic-011-已解锁)。

- ✅ [US-534 看板领域模型骨架：Board / Column / Task 与按列排序域](stories/domain/US-534-board-column-task-skeleton.md)
- ✅ [US-535 跨列移动与本列排序的领域语义](stories/domain/US-535-cross-column-move-ordering.md)
- ✅ [US-536 任务详情与编辑：标签、截止日与撤销重做](stories/domain/US-536-task-detail-editing.md)
- 🚧 [US-537 重开恢复与备份导出](stories/domain/US-537-board-backup-restore.md)
- ✅ [US-538 看板任务搜索：FTS 接线](stories/domain/US-538-board-task-search.md)
- ✅ [US-539 三框架看板视图与交互](stories/domain/US-539-board-tri-framework-ui.md)
- 🚧 [US-540 看板端到端 demo：一份数据集走完全域](stories/domain/US-540-board-end-to-end-demo.md)
- ⬜ [US-541 团队版看板：Supabase 同步与身份](stories/domain/US-541-board-team-sync.md)

### [P2P 会话与局域网协作](epics/epic-012-p2p-lan-collaboration.md)

四条均价值待证，留在立项池，共同前置是 US-708 会话层；owner 已定会话层之后先做 US-709，排序不等于解锁。

- ⬜ [US-709 整库克隆：从局域网里自己的另一台设备克隆数据库](stories/future/US-709-p2p-database-clone.md)
- ⬜ [US-710 实时信号：在线状态、编辑标记与变更提示](stories/future/US-710-p2p-live-signals.md)
- ⬜ [US-711 远程 DevTools：经 P2P 会话检查另一台设备上的库](stories/future/US-711-p2p-remote-devtools.md)
- ⬜ [US-712 局域网枢纽：一台设备充当远端](stories/future/US-712-p2p-lan-hub.md)

### [局域网 P2P 大文件共享](epics/epic-013-p2p-file-share.md)

US-704～US-707 已获 owner 授权，US-708 会话层由 owner 决定在 PR #172 内完成，US-713 管理后台由 owner 决定随独立 demo 交付；认证宿主已选定（Supabase + Cloudflare，见 US-704「开工前置」），US-707 本轮交付独立 demo 与浏览器半边。
当前排期与准入见 [roadmap 批次 7](roadmap.md#批次-7局域网-p2p-大文件共享p2p-epic-已解锁)。

- 🚧 [US-704 文件清单与 P2P 发现](stories/future/US-704-p2p-manifest-discovery.md)
- 🚧 [US-705 P2P 字节传输](stories/future/US-705-p2p-byte-transfer.md)
- 🚧 [US-706 服务器兜底与认证](stories/future/US-706-p2p-fallback-auth.md)
- 🚧 [US-707 跨运行时 demo 与多实例 e2e](stories/future/US-707-p2p-cross-runtime-e2e.md)
- ✅ [US-708 P2P 会话层：一对设备一条会话、多协议复用](stories/future/US-708-p2p-peer-session.md)
- 👀 [US-713 P2P demo 管理后台：管理员总览并处置账号与服务](stories/future/US-713-p2p-admin-console.md)

### [提交图远端交换与草稿回写](epics/epic-014-commit-graph-remote-exchange.md)

- ✅ [US-319 导入远端提交：保留提交身份并快进分支头](stories/collaboration/US-319-remote-commit-import.md)
- ✅ [US-320 放弃与恢复回写业务表](stories/collaboration/US-320-discard-restore-projection.md)

### [按身份授权的同步与本机数据隔离](epics/epic-015-identity-scoped-sync.md)

US-237 / US-039 / US-238 是 2026-11-28 owner 定方向「连 Supabase 走平台标准逻辑」之后补的连接层缺口，Admin 是它们的第一个三端业务验收；排期见 [roadmap 批次 13](roadmap.md#批次-13supabase-标准接入epic-015-续admin-是首个三端业务验收)。US-040（恢复时核对身份绑定）是 Admin 的 ADMIN-US-222 验收时发现的缺口，已交付。

- ✅ [US-029 按作用域的成员写权限：实体声明作用域与所需权限，本地写入口快速拒绝，三端按行显隐入口](stories/core/US-029-rbac-owner-role-permission.md)
- ✅ [US-033 按授权分区同步（只读）：分区决定能读什么，实体同步规则决定同步哪些](stories/core/US-033-identity-scoped-read-sync.md)
- ✅ [US-034 分区实体的本地写入：本地增删改可撤销/重做，推送后锁定](stories/core/US-034-bucketed-entity-local-writes.md)
- ✅ [US-035 每个身份一个本地库：打开时核对身份，换账号不混数据](stories/core/US-035-identity-bound-local-database.md)
- ✅ [US-036 规则之外的公开数据：在线浏览走只读浏览实体，不进同步子集](stories/core/US-036-browse-public-data-outside-sync-rule.md)
- ⬜ [US-039 整库一个作用域：库里每一行都属于同一个团队时，实体不带作用域列也能按授权快照判定写入、三端按权限显隐](stories/core/US-039-instance-access-scope.md)
- ✅ [US-040 恢复归档时核对身份绑定：别的身份的备份恢复不进当前身份的库，没有绑定的旧备份照常恢复](stories/core/US-040-restore-identity-binding.md)
- ✅ [US-229 Supabase 远端变更历史：每次业务写入记完整前后快照，只对能编辑的成员开放](stories/adapter/US-229-supabase-change-history.md)
- ✅ [US-234 Supabase 租户内成员权限：管理员能改、员工只能看，dev-rxdb-supabase 完整演示](stories/adapter/US-234-supabase-tenant-member-permissions.md)
- ⬜ [US-237 Supabase 会话层：一个客户端负责登录、会话恢复、离线身份与按身份换库，应用不再各写一套](stories/adapter/US-237-supabase-session-layer.md)
- ⬜ [US-238 Supabase 适配器只接身份与授权：不走日志同步的库不订阅变更频道、不探日志表，服务端只需授权函数](stories/adapter/US-238-supabase-adapter-identity-grants-only.md)

### [本机修改工作台：推送、拉取、撤销与历史的统一交互](epics/epic-016-local-change-workbench.md)

- ✅ [US-230 dev-rxdb-supabase 顶栏统一推送与拉取：页面登记要哪些按钮，待拉数准确，推之前看得见会推什么](stories/adapter/US-230-supabase-header-sync.md)
- ✅ [US-231 dev-rxdb-supabase 三页交互统一：撤销、重做与操作历史同一位置、作用域写在控件上](stories/adapter/US-231-supabase-unified-undo-history.md)
- ✅ [US-232 dev-rxdb-supabase 商品「模拟服务端变更」收进右侧抽屉：主界面先看本机数据，需要时再打开](stories/adapter/US-232-supabase-catalog-server-drawer.md)
- ✅ [US-233 Supabase 待拉数与能拉的对不上：刷新后把自己推的算进去，分区按变更号差计](stories/adapter/US-233-supabase-pullable-count-accuracy.md)
- ✅ [US-235 dev-rxdb-supabase 订单页一个窗口就能测：页面上写明怎么测，远端数据看得见，没推的行标出来](stories/adapter/US-235-supabase-orders-testability.md)
- ✅ [US-236 Supabase 同步状态一轮问完：打开页面不再为每个仓库各发三个请求，频道订阅上只重算一次](stories/adapter/US-236-supabase-sync-status-batching.md)
- ✅ [US-316 撤销/重做的多仓库作用域：几个实体合起来撤，跨它们的事务整条撤](stories/collaboration/US-316-multi-repository-history-scope.md)
- ✅ [US-317 待推送清单：与待推数同一口径的历史项流](stories/collaboration/US-317-pushable-histories.md)
- ✅ [US-318 本地外键级联删除与源删除记进同一个事务：一次撤销整组恢复，互相引用的也撤得回来](stories/collaboration/US-318-cascade-delete-one-transaction.md)

### [仅经 PR 的团队数据：Supabase 上的提交图交换、数据 PR 与团队协作](epics/epic-017-pr-only-team-data.md)

价值待证：具名使用方只有 Admin，且它已有可用的产品实现；三条都在 [roadmap 立项池](roadmap.md#立项池待-owner-决策未进任何批次)，解锁信号见各故事的「解锁条件」。

- ⬜ [US-239 Supabase 团队成员、邀请与协作实时：邀请绑定已验证邮箱、撤权即时生效、私有频道的业务通知与在线成员](stories/adapter/US-239-supabase-team-membership-realtime.md)
- ⬜ [US-321 Supabase 上的提交图远端交换：服务端存提交与引用，按预期头上传、分页下载，跨设备保留提交身份](stories/collaboration/US-321-supabase-commit-exchange.md)
- ⬜ [US-322 仅经 PR 写入：实体声明写入模式，共享数据只能经绑定候选的审核与原子合并改变](stories/collaboration/US-322-pr-only-write-mode.md)

## 前置阻塞（不体现在 Blocked 计数里）

- BOM按已授权切片推进，后续故事仍受各自前置约束；联产品、热路径与可选索引保留独立准入。
- US-910留在立项池，不因Backlog状态自动获得开工授权。US-603 已获授权并进入本轮执行。
- 成员权限（批次 11）：US-029 阶段 C 以 US-234 阶段 A 为前置；US-234 的演示部分排在 epic-016 的页面骨架（US-230 阶段 A、US-231 阶段 A、US-232）之后。
- P2P（US-704～707）已解锁，协议层的内存测试不替代真实宿主验收；依赖身份的验收等 US-704 选定认证宿主。US-708 会话层随 PR #172 交付。
- epic-012（US-709 / US-710 / US-711 / US-712）价值待证，留在立项池，以 US-708 会话层为共同前置。
- US-910/911的最小能力验证、US-211/219的真实宿主证据、US-528的仓外消费均不能由源码单测替代。
- Epic关闭还须满足其当前承诺目标和实际发布验收，不能只看所属故事的Done数量。
