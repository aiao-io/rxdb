---
package: rxdb-model-react
status: IncrementalReview
baseline: ffed57da
incrementalFrom: 18ea576f
reviewed: 2026-10-26
---

# rxdb-model-react 增量代码评审

## 结论

🔴 待处理：1 条 P1、2 条 P2。上轮问题继续保留；本提交区间未提供关闭证据。

## 提交与检查范围

- 上轮报告提交：`18ea576f`（2026-10-16，PR #128）；本轮检查到 `ffed57da`。逐包提交、全量增量统计与验证边界见 [本轮记录](./incremental-2026-10-26.md)。
- 本包变化：实现 1 文件、测试/测试工具 3 文件、配置/文档/版本 2 文件；以 Git 路径变化计，不把版本发布当成功能修复。
- 提交：`c425f414 chore(deps): safely upgrade workspace dependencies`；`967aa658 12313`；`b109ba33 feat(aiao): 重构 worktree 功能 (#122)`；`23d8a098 chore(aiao): release 0.0.28 (#153)`。
- 检查重点：EntityList 只读能力、可编辑列关闭与 undo/redo barrier 订阅清理；旧 EntityTable/QueryBuilder/EntityDetail 的 StrictMode 和异步源路径未改。
- 实现锚点：`src/entity-list/entity-list.tsx`。

## 发现

### P1：StrictMode 开发模式下 `EntityTable` 永久空白——`tableReady` 卸载不复位

- 证据：`src/entity-table/entity-table.tsx:253-257` 初始化守卫 `if (!tableRef.current && !tableReady && ...)`；全文件唯一 `setTableReady(true)` 在 `257` 行；销毁清理（`471-490`）释放表格并置 `tableRef.current = null`，但**从不复位 `tableReady`**。StrictMode 的「挂载→卸载→重挂」模拟后，第二次挂载时守卫恒为 false，表格不再重建。
- 触发：任何包了 `<React.StrictMode>` 的宿主（Vite/Next 模板默认；本仓 `apps/dev-rxdb-react/src/main.tsx:33` 即如此，entity-list 页用 EntityList→EntityTable）在 dev 下看到空表格；生产构建不受影响（StrictMode 双调用仅 dev），但默认脚手架下组件完全不可用。
- 对照：Vue 端 `EntityTable.vue:387` 在 onBeforeUnmount 复位 `tableReady.value = false`；Angular 端 ngOnDestroy 同样复位——React 是唯一漏掉的一端。
- 建议：destroy 清理里 `setTableReady(false)`（或从初始化守卫中去掉 `!tableReady` 项），并补 StrictMode 双挂载回归。

### P2：StrictMode 下 `initialQuery` 被静默丢弃——服务重建后初始条件不复位

- 证据：`src/query-builder/query-builder/query-builder.tsx:68、89-115、126-133`。服务创建 effect（deps `[dragDropHandler]`）在模拟重挂时重建全新 service，但 `lastAppliedInitialQueryRef` 在第一次运行时已置位且 cleanup 从不复位；第二次（真正生效的）service 永远收不到 `fromRxDBQuery(initialQuery)`。`subquery-builder/subquery-builder.tsx:47、62-84、94-101` 同形。
- 触发：StrictMode + 传入 `initialQuery`（如 EntityList 筛选弹层回填已生效筛选）→ dev 下查询构建器显示为空。
- 对照：Angular（`query-builder.component.ts:248` effect）与 Vue（`QueryBuilder.vue:103-112` watch immediate）无此问题。
- 建议：服务 effect 的 cleanup 把 ref 复位，或建好服务后直接在服务 effect 内应用 `initialQuery`。

### P2：create 模式草稿只在首帧创建，异步 `rxdb` 就绪后不再补建——保存退化为 emit-only、关系绑定失效

- 证据：`src/entity-detail/entity-detail.tsx:166-175` 草稿实体只在 lazy `useState` 初始化器创建一次，依赖首帧的 `rxdb`（`169` 行 `if (!rxdb) return null;`）；`useRxDBOptional` 在异步 source（Promise/工厂，文档化的一等模式，见 `rxdb-react.tsx:189-190、273-277`）下首帧返回 undefined、解析后才有值——此后 `draftEntity` 恒为 null，`handleSave` 静默走 emit-only 路径（`347-359`），关系 tab 的 `fixedQuery`/`fixedFormData`（`368-399`）因依赖草稿而失效（级联新增子实体不再绑定父外键）。
- 对照：Angular（`entity-detail.ts:290-295` effect 补建，注释明确「独立使用语境的 inputs 要到首次变更检测才写入，由 effect 补建」）与 Vue（`EntityDetail.vue:268-281` watch immediate，rxdb/meta/cls 到达后重建）都覆盖了迟到输入，唯独 React 没有。
- 建议：加一个 effect 在 rxdb/metadata/formMode 就绪后调用同一草稿创建逻辑（镜像 Vue watch），并在 save 路径对「草稿缺失」保持显式行为。

## 验证与限制

本轮对本包执行静态增量检查，未单独运行其 lint/typecheck/test/build；不沿用旧报告的测试通过结论。

本轮环境为 Node `26.12.0`、pnpm `10.34.9`；旧报告的 Node 22 / Nx 插件加载限制已过时。未列出的任务与宿主验证不视为通过，统一边界见 [本轮记录](./incremental-2026-10-26.md#未覆盖)。
