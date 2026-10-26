---
package: rxdb-model-angular
status: IncrementalReview
baseline: ffed57da
incrementalFrom: 18ea576f
reviewed: 2026-10-26
---

# rxdb-model-angular 增量代码评审

## 结论

🟡 待处理：1 条 P2。上轮问题继续保留；本提交区间未提供关闭证据。

## 提交与检查范围

- 上轮报告提交：`18ea576f`（2026-10-16，PR #128）；本轮检查到 `ffed57da`。逐包提交、全量增量统计与验证边界见 [本轮记录](./incremental-2026-10-26.md)。
- 本包变化：实现 2 文件、测试/测试工具 2 文件、配置/文档/版本 1 文件；以 Git 路径变化计，不把版本发布当成功能修复。
- 提交：`e75284f0 fix(deps): address dependency review findings`；`967aa658 12313`；`b109ba33 feat(aiao): 重构 worktree 功能 (#122)`；`23d8a098 chore(aiao): release 0.0.28 (#153)`。
- 检查重点：EntityList 只读能力、可编辑列关闭与 undo/redo barrier 提示；旧 EntityDetail 空断言路径未改。
- 实现锚点：`src/entity-list/entity-list.component.html`、`src/entity-list/entity-list.component.ts`。

## 发现

### P2：`metadataValue`/`formFieldsValue` 回退链以 `#dialogData!` 收尾，独立使用 + 解析失败时模板抛 TypeError

- 证据：`src/entity-detail/entity-detail.ts:240-242` `get metadataValue(): EntityMetadata { return this.metadata() ?? this.#metadataFromRouteInputs() ?? this.#dialogData!.metadata; }`；`245` 行的 `formFieldsValue` 同款 `this.#dialogData!.formFields`。独立使用（无 CDK dialog）且 namespace/name 无法解析（路由参数笔误、实体未注册、未配 RxDB provider）时，`#dialogData` 为 null，非空断言在模板 `[title]="dialogTitle()"`（`entity-detail.html:1`）的变更检测期抛 TypeError。
- 触发：上述配置下宿主页面在变更检测时崩溃；React（`entity-detail.tsx:188` 回退 undefined）与 Vue（`EntityDetail.vue:239-241`）在同样配置下降级为空标题/空 tabs 而非崩溃。
- 建议：`#dialogData` 为 null 时回退 `undefined`/`[]`（或让两个 getter 声明可空），与另两端语义对齐。

## 验证与限制

本轮对本包执行静态增量检查，未单独运行其 lint/typecheck/test/build；不沿用旧报告的测试通过结论。

本轮环境为 Node `26.12.0`、pnpm `10.34.9`；旧报告的 Node 22 / Nx 插件加载限制已过时。未列出的任务与宿主验证不视为通过，统一边界见 [本轮记录](./incremental-2026-10-26.md#未覆盖)。
