---
id: PR-129-REVIEW-2026-11-02
title: PR #129 BOM 领域闭环与三框架绑定深度评审
status: Open
created: 2026-11-02
updated: 2026-11-07
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

## 初次评审发现

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

当前分支已按红绿顺序修复该 P1：真实 SQLite/PGlite 共 4 条定向回归先失败，修复后 4/4 通过，覆盖生效日前排除、到达生效日后可见，以及两条查询入口和成本结果。后续完整 BOM 测试与覆盖率、三框架和应用门禁均已通过，4b25a948 的完整 102 项目、414 目标 affected 门禁也已通过。a5a9f7cf 的正式性能 CI 后续已通过；虚拟件制费说明复核及修复见下文。最终集成源码的完整门禁、远端检查与统一评审仍待闭环，当前不计为全部交付。

## 2026-11-07 修复验证

- 复核基线为 6dd47b01，旧查询确实仍提前返回未来输出修订和未来逻辑行 ECN 的来源；未用存储绕过或模拟查询制造失败。
- `coproduct.ts` 的来源查询关联输出修订，按发布状态、所属物料及 `effectiveFrom <= asOfDate` 过滤；发生项与逻辑行 ECN 复用 `bom-sql.ts` 的既有可见性表达式。
- `bom-coproduct.spec.ts` 新增两组双后端回归，同时执行 `findJointCostSources`、`readJointProduction` 与成本核对；完整套件 89 文件、1550 项通过、1 项后端条件跳过，四条新增回归包含在内，未处理异常为 0。
- 红测日志：`/tmp/bom-joint-visibility-red.log`；定向绿测：`/tmp/bom-joint-visibility-green.log`。首轮测试夹具的 Repository 接口调用错误已更正后重新取得 4 条业务断言失败，不把夹具错误算作功能红。

- 完整覆盖率证据：`/tmp/bom-joint-visibility-full-evidence.json`；102 项目 affected 最终通过证据：`/tmp/bom-final-affected-after-joint-evidence.json`。后续运行源码变化须重新核对受影响验证，不能沿用旧提交的 CI 结论。

## 2026-11-07 虚拟件制费说明复核

在提交 `a5a9f7cf` 上复核旧评审的工序制费问题时，发现虚拟件扁平汇总仍有同类 P2：根件依次消费两个虚拟件，第一个声明制费、第二个工作中心未声明制费，`rollupCost()` 返回制费 `2.5`，但 `overheadReason` 被后一个虚拟件覆盖为「工作中心未声明制费」。交换发生项顺序后说明又变为「按工时计」。应用成本明细直接展示该依据，金额与解释会矛盾。

- 双后端各增加两种发生项顺序的回归，同时断言批成本 `6.5`、制费 `2.5` 与理由「按工时计」。旧实现 2 项失败、2 项通过，失败均为说明不符，金额断言已通过。
- 修复只调整虚拟件聚合理由：已存在「按工时计」时保留该理由，后继未声明制费或无路线不会覆盖它；成本金额、工序明细及公开 API 保持原合同。
- 定向验证完整执行 `bom-cost.spec.ts` 与 `bom-phantom-cost.spec.ts`，74/74 通过；lint、typecheck 通过。隔离工作区完整 BOM 套件 89 文件、1554 项通过、1 项后端条件跳过，语句/分支/函数/行覆盖率为 96.31% / 89.72% / 97.29% / 97.77%，四项均达到本包 80% 门槛。修复已集成至 322bb6f0，生产浏览器 40/40、本地部署 5/5、公网 5/5 和 64 个发布资产哈希核验通过；最终源码 affected 与最终提交远端 CI 仍待核对。
- 原始红绿证据为 `/tmp/bom-phantom-overhead-red-evidence.json`、`/tmp/bom-phantom-overhead-green-costs-evidence.json`；完整套件证据为 `/tmp/bom-phantom-overhead-full-plugin-evidence.json`。隔离验证不替代最终集成源码的完整 affected 与远端检查。
