---
id: RV-012
title: RxDBBranch 声明了树能力却从不使用，并卡住 US-025 阶段 E
status: Resolved # Open / Resolved
created: 2026-09-16
updated: 2026-09-20
pr: # 修复 PR 链接，Resolved 时填
---

# Review：`RxDBBranch` 去树化

## 问题

[`RxDBBranch`](../../packages/rxdb/src/system/branch.ts) 是四张系统表里唯一挂 `@TreeEntity` 的
（`RxDBChange` / `RxDBSync` / `RxDBMigration` 都是 `@Entity`）：

```ts
@TreeEntity({
  namespace: 'rxdb',
  name: 'RxDBBranch',
```

这条声明带来三件对外可见的事，没有一件被兑现。

### 1. 四个树查询方法零消费者

`RxDBBranch.findDescendants` / `findAncestors` / `countDescendants` / `countAncestors`
（连同 [`LocalRxDBBranchRepository`](../../packages/rxdb/src/system/types.local.ts) 与
[`RemoteRxDBBranchRepository`](../../packages/rxdb/src/system/types.remote.ts) 上的同名方法）
在全仓非测试代码里一次都没有被调用。

**复验**：`grep -rn "findDescendants\|findAncestors\|countDescendants\|countAncestors" packages/*/src`，
排除 `__tests__` / `*.spec.ts` 后的命中只有三类：`branch.ts` 的 `declare static`、`system/types*.ts`
的类型声明、以及 [`TreeRepository`](../../packages/rxdb/src/repository/TreeRepository.ts) 自身的实现。

### 2. 分支的祖先遍历是手写的，而且**必须**手写

[`find_switch_branch_step`](../../packages/rxdb-plugin-history/src/find-switch-branch-step.ts) 的
`getPathToRoot()` 自己爬 `parentId`，并把坏数据当错误抛出：

```ts
while (current.parentId) {
  if (visited.has(current.parentId)) {
    throw new RxDBError(`Branch history is corrupt: cycle detected at branch '${current.id}' ...`);
```

树查询给不出这里需要的三样东西：

| 需要的                   | 递归 CTE 给的                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------- |
| 断链 / 成环报错          | **静默截断**——返回一棵少了枝干的树，不是错误（同 `unsupportedTreeQueryCache` 的判据） |
| **有序**路径             | 集合；共同祖先要靠 `currentPath` / `nextPath` 的下标比对才算得出                      |
| 每段 `fromChangeId` 区间 | 只认 `parentId`，不认分支的 `fromChangeId` / `local` / `remote` 语义                  |

同样的手写遍历还有三处：[`collectBranchChain`](../../packages/rxdb-plugin-sync/src/branch-utils.ts)、
[`sync_branches`](../../packages/rxdb-plugin-sync/src/sync-branches.ts) 的落库拓扑排序、
以及 [`remove_branch`](../../packages/rxdb-plugin-history/src/remove-branch.ts) 的直查 `parentId`——
后者的注释已经写明这不是偷懒：

```ts
// 必须直接查 `parentId`：拿「父分支有哪些 change、子分支的 fromChangeId 是否落在其中」
```

也就是说树能力在分支上不只是没人用，而是**用了会错**。类型上摆着四个"能查祖先"的方法，
是在诱导后来者用错。

### 3. 它是 US-025 阶段 E 的硬前置

[US-025](../stories/core/US-025-core-plugin-extraction.md) 阶段 E 要把树实体外移成
`@aiao/rxdb-plugin-tree`。核心的系统表自己在用树能力，于是分支所在的 history 插件反过来要
`inject: ['plugin:tree']`——为搬走 474 行新增一条跨插件边，且「只要历史就得连 tree 一起装」。

## 根因

`@TreeEntity` 声明的是**能力**，不是**表结构**。
[`TreeEntity`](../../packages/rxdb/src/entity/tree-entity.decorator.ts) 全部作用只有三条：
补 `features.tree.type = 'adjacency-list'`、补 `features.tree.hasChildren = false`、
强制 `repository: 'TreeRepository'`。

而分支真正需要的 `parentId` 列来自它**自己**在 `relations` 里写的 `parent` / `children` 自引用关系——
`RxDBBranch` 并不继承 [`TREE_ADJACENCY_LIST_ENTITY_BASE_OPTIONS`](../../packages/rxdb/src/entity/tree-entity-base.ts)，
关系、可空性、无级联删除都是它自己声明的。当年选 `@TreeEntity` 换到的唯一实质是「将来也许用得上的递归查询」，
而这个「也许」在十余处调用点里一次都没兑现。

## 修复方案

`@TreeEntity` → `@Entity`，同时收掉跟着它出去的类型面。

| 文件                                                                       | 改动                                                                                                                                  |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| [`system/branch.ts`](../../packages/rxdb/src/system/branch.ts)             | 装饰器换成 `@Entity`；删 4 个树方法的 `declare static`；删 `FindTreeOptions` / `RxDBBranchTreeRuleGroup` 两个 import                  |
| [`system/types.ts`](../../packages/rxdb/src/system/types.ts)               | 删 `RxDBBranchTreeRule` / `RxDBBranchTreeRuleGroup`，以及 `RxDBBranchStaticTypes` 里 4 个 `*DescendantsOptions` / `*AncestorsOptions` |
| [`system/types.local.ts`](../../packages/rxdb/src/system/types.local.ts)   | 删 4 个树方法                                                                                                                         |
| [`system/types.remote.ts`](../../packages/rxdb/src/system/types.remote.ts) | 删 4 个树方法                                                                                                                         |
| `requirements/api-baseline/rxdb.json`                                      | `pnpm audit:api-surface:update`——删除项只有顶层导出 `RxDBBranchTreeRuleGroup`（基线只记导出名与 kind，接口成员不在其中）              |
| `website/docs/api/rxdb/**`                                                 | 随 typedoc 重生成                                                                                                                     |

**表结构一字不改**：`rxdb_branch` 的 DDL、索引、触发器都与 `features.tree` 无关
（复验：`grep -in tree packages/rxdb-adapter-{pglite,sqlite-core}/src/table/*.ts` 零命中），
因此不触发系统表迁移，与迁移收尾冻结到 1.0.0 的现状无冲突。

## 权衡

### 收益

| 收益                                                                      | 强度                                                          |
| ------------------------------------------------------------------------- | ------------------------------------------------------------- |
| 解开 US-025 阶段 E 的硬前置，且不新增 history → tree 跨插件边             | 实证：US-025「前置与阻塞」列的就是这一条                      |
| 删掉一段**会把人带沟里**的公开 API（问题 2）                              | 实证：四处手写遍历的注释各自写明了为什么不能用树查询          |
| 核心系统表不再依赖可选能力，`features` 门面轴上少一个「一等公民」历史包袱 | 推断：随阶段 E 的 `RxDBRepositories` 注册表改造一起才完全兑现 |

### 代价

| 代价                                                                     | 量级                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 破坏性变更：删 1 个顶层导出类型 + 2 个接口各 4 个方法 + 4 个实体静态方法 | 0.0.25 pre-1.0；受众是系统内部表，devtools / 三框架 / demo 均未使用                                                                                                                                                                                                                                                          |
| 4 个核心文件 + 基线 + 生成文档                                           | 半天以内                                                                                                                                                                                                                                                                                                                     |
| 适配器为分支选的仓储类从 `*TreeRepository` 换成普通 `*Repository`        | **行为零差异**：三个适配器的树仓储都只追加方法、无 `override`（复验：`for f in $(find packages -path "*/src/*" -name "*TreeRepository*.ts" -not -path "*__tests__*"); do echo "$f: $(grep -c override $f)"; done` 三个适配器均为 0），`hasChildren` 计算列只在 `features.tree.hasChildren === true` 时进 SQL，分支是 `false` |
| 测试改动                                                                 | 零：没有任何用例断言分支是树实体（断言 `'TreeRepository'` 的用例全在 client-generator / `metadata-transition` / graph 契约里）                                                                                                                                                                                               |

### 替代方案

| 方案                                 | 做法                                   | 判定                                                                                        |
| ------------------------------------ | -------------------------------------- | ------------------------------------------------------------------------------------------- |
| **A. 去树化**                        | 分支改 `@Entity`，类型面同步收         | ✅ 采纳。减法，不新增抽象                                                                   |
| B. 分支随 history 插件走并自带树能力 | history 插件 `inject: ['plugin:tree']` | ❌ 为搬 474 行新增一条跨插件硬边：只要历史就得装 tree，与阶段 E「按需安装」的目标相反       |
| C. 维持现状，阶段 E 不做             | 什么都不改                             | ❌ 问题 2 的误导成本继续留着；而且阶段 E 的账永远算不清——前置没解开，谁也没法量它到底值不值 |

### 不做的代价

若阶段 E 最终判定不做，去树化仍留下问题 2 的收益（删掉一段用了会错的 API）。
按 CONVENTIONS 的「病灶数 ≥ 抽象数」判据：本项**不新增任何抽象**，是纯删除，判据不构成阻碍。

### 将来真需要按父链查分支怎么办

[US-305](../stories/collaboration/US-305-commit-graph-head.md) 的 commit 图是 commit 链，不是分支树——
「普通 commit 固定一个父节点」，父链遍历发生在新实体 `commit` 上，而它属于 commit / history 插件；
插件侧要依赖 tree 插件是自由的，不构成核心对可选能力的依赖。分支表本身在可预见的需求里
仍然只需要「爬 `parentId` + 报坏数据」这一种遍历。

## 风险与复验

| 风险                                          | 处置                                                                                       |
| --------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 外部使用者调用了 `RxDBBranch.findDescendants` | 迁移说明写明替代：全量 `find()` 后在内存里按 `parentId` 组装（这正是四处内部调用点的做法） |
| 分支表在 supabase 侧改走普通仓储后行为漂移    | 跑 `rxdb-adapter-supabase` 的 `pull-push-changes` / `zz-second-pass-probe`                 |
| 切换 / 删除 / 合并分支路径回归                | 见下方命令                                                                                 |

```bash
pnpm nx run-many -t test --projects=rxdb,rxdb-plugin-history,rxdb-plugin-sync
pnpm nx test rxdb-adapter-pglite      # __tests__/version/* 与 table/create_tables_sql
pnpm nx test rxdb-adapter-sqlite-core # shared-version-branch.suite
pnpm nx test rxdb-devtools            # rxdb-contract.spec
node scripts/audit/api-surface.mjs    # 基线差异应只有 RxDBBranchTreeRuleGroup 一项删除
```

## 决策

✅ **值得做**，独立小 PR，不与 US-025 阶段 E 绑定先后。

阶段 E 自身的「价值待证」标注**不因此撤销**：去树化解开的是前置，不是证据；
阶段 E 值不值得做，要量的是 474 行树实体代码在实际产物里的重量，而不是行数。

## 解决记录

- [x] 代码修复落地：`system/branch.ts` 由 `@TreeEntity` 改 `@Entity`，四个树查询方法与
      `RxDBBranchTreeRuleGroup` 从 `types.ts` / `types.local.ts` / `types.remote.ts` 删除；
      新增元数据契约用例锁死不回退；两处 DDL 快照零 diff，表结构未变
- [ ] 开 PR 并合并（`pr` 字段记录链接）
