---
id: PR-129-REVIEW-2026-11-02
title: PR #129 BOM 领域闭环与三框架绑定深度评审
status: Open
created: 2026-11-02
updated: 2026-11-02
pr: https://github.com/aiao-io/rxdb/pull/129
---

# Review：PR #129 BOM 领域闭环与三框架绑定

## 评审基线与范围

- PR：[#129](https://github.com/aiao-io/rxdb/pull/129)
- 分支：`claude/bom-related-work-77235b`
- 评审 HEAD：`f002ee898c95f584136173593e87c17997e66546`
- 与 `origin/main` 的 merge-base：`94e89be7dcd25575d2f9b5d560e1861fc645e78c`
- 范围：完整分支差异（BOM 核心包、SQLite/PGlite 适配器、RxDB 公共存储/仓储改动、Angular/React/Vue 绑定、demo/e2e、需求与规格文档）。
- 规则：按仓库 `AGENTS.md`、`requirements/CONVENTIONS.md`、`requirements/reviews/README.md` 执行；整分支报告不占 `RV-*` 编号。

## 发现

### 🔴 P1：联产成本来源绕过评估日，未来修订和未来生效 ECN 会进入当前成本

**触发路径**

1. 建立一个已发布生产头，其 `produce` 发生项引用一个已发布但 `effectiveFrom` 晚于本次 `CostRollupContext.asOfDate` 的输出修订；或者给该发生项挂一张 `released`、但 `effectiveDate` 晚于评估日的 ECN。
2. 调用 `rollupCost()`，在成本树走到 `readJointProduction()` / `findJointCostSources()`。
3. `visibleOutputs()` 会检查父头修订的 `r.effectiveFrom` 与发生项自己的 `o.effectiveFrom`，但查询没有 join 输出修订表，也没有检查 `o.childRevisionId` 对应修订的 `effectiveFrom`；同时 `ecnInId` / `line.ecnInId` 的 EXISTS 条件只检查 `e.state = 'released'`，没有 `e.effectiveDate <= context.asOfDate`。

**证据锚点**

- [packages/rxdb-plugin-bom/src/coproduct.ts:73](../../packages/rxdb-plugin-bom/src/coproduct.ts#L73) `visibleOutputs()` 的过滤条件。
- [packages/rxdb-plugin-bom/src/coproduct.ts:85](../../packages/rxdb-plugin-bom/src/coproduct.ts#L85)～[94](../../packages/rxdb-plugin-bom/src/coproduct.ts#L94)：父修订/头与发生项日期有过滤，输出修订日期和 ECN 生效日缺失。
- [packages/rxdb-plugin-bom/src/coproduct.ts:100](../../packages/rxdb-plugin-bom/src/coproduct.ts#L100)：查询直接把 `o.childRevisionId` 当作输出修订返回，未 join `item_revision` 做时点校验。
- [packages/rxdb-plugin-bom/src/coproduct.ts:145](../../packages/rxdb-plugin-bom/src/coproduct.ts#L145)～[171](../../packages/rxdb-plugin-bom/src/coproduct.ts#L171)：`readJointProduction()` 将 `visibleOutputs()` 结果组装成联产输出并参与固定份额成本分配。

**后果**

`asOfDate = T` 的成本结果会读取 T 之后才生效的输出修订或 ECN 新增行。成本金额、联产份额、下游显式来源依据因此可能提前变化；同一上下文的数量解析遵循完整 ECN/修订时点合同，成本与数量会出现不一致，且结果带有错误的 `jointManifest.sources`。

**修复建议**

让联产来源查询复用解析侧的可见性口径：join `item_revision childRevision`，要求 `state = 'released'`、`effectiveFrom <= context.asOfDate` 且 `childRevision.itemId = o.childItemId`；`ecnInId` 与逻辑行 `ecnInId` 的 EXISTS 条件同时要求 `effectiveDate <= context.asOfDate`。把这两个条件加入 SQLite 与 PGlite 同一份 SQL，并补一组双后端回归：未来输出修订在评估日前不得成为来源，未来生效 ECN 的 produce 行不得进入成本，推进评估日后才进入；同时核对 `findJointCostSources` 和 `readJointProduction` 两条入口。

## 三框架与公共包核查

- `rxdb-plugin-bom-angular/src/index.ts`、`rxdb-plugin-bom-react/src/index.ts`、`rxdb-plugin-bom-vue/src/index.ts` 共享类型导出一致：`BomViewCommands`、`BomViewInput`、`BomViewState`；运行时入口均为 `useBomView`，组件均提供 `BomTree` 与 `BomLineEditor`。
- 三端命令集合均由共享 `BomViewCommands` 提供：`setInput`、`refresh`、`toggle`、`loadOccurrence`、`saveOccurrence`、`calculate`。框架差异仅在 signal / React 快照 / Vue shallowRef 的绑定语义，未发现单端缺 API。
- 核心 BOM 包与 SQLite/PGlite 适配器都切换到实例生效的 `getEntityStorageMetadata()`；公共存储指纹、影子表和漂移检查同步纳入 generated columns / advanced indexes。此处未发现与本发现独立的高置信缺陷。

## 验证记录

- `pnpm nx show project rxdb-plugin-bom --json`：通过（使用 Node 26 与 `npm_config_manage_package_manager_versions=false` 绕过本机 pnpm shim 问题）。
- `pnpm nx run rxdb-plugin-bom:test --run --maxWorkers=1`：执行到 723 个通过、151 个跳过；浏览器覆盖率阶段因共享 `node_modules` symlink 指向 `/private/tmp/rxdb-pr129-fix`，Vitest/Vite 拒绝外部 PGlite WASM/coverage 模块，最终 6 个文件、46 个测试失败、264 个执行错误。失败是测试运行环境的文件服务边界（日志含 `request id ... is outside of Vite serving allow list` 与 `Failed to fetch dynamically imported module ... @vitest/coverage-v8/browser`），不能作为本分支业务行为通过证据。
- 评审期间曾用临时 Vite `server.fs.allow` 复跑；浏览器 runner 在构建完成后未进入稳定结果，临时配置已删除，未把验证文件写入分支。
- 未执行完整 `test-all` / e2e；原因是核心浏览器 runner 已被环境边界阻断，且本报告只提交评审文档。

## 结论

当前分支三框架 API 对称性通过；核心与适配器存储元数据接线未见额外高置信问题。PR 合入前应先修复 P1，并补齐未来输出修订与未来 ECN 生效日的双后端成本回归。
