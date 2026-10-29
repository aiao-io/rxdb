# rxdb-plugin-tree 深度评审

- 包：`@aiao/rxdb-plugin-tree`
- 日期：2026-10-29
- 基线：`f62f77c19d55c73d8335df026778422282c2fed4`
- 结论：🟡凑合。TREE-001 仍有效；新增 TREE-002（P2，同族 REMOVE 侧）。

## 评审计划与实际范围

对比树仓储与 SQL 的基准成员、递归成员、where、level、计数约定，检查 CREATE/UPDATE/REMOVE 增量合并及环保护，并对三端透传方式复核。

## 核查结果

- [`TreeRepository.#normalizeOptions`](../../../packages/rxdb-plugin-tree/src/repository/TreeRepository.ts) 统一校验非负安全整数 level，并用 nullish 判定保留整数 id=0。
- [`traverseAncestors`](../../../packages/rxdb-plugin-tree/src/query/query-tree.utils.ts) 和 `isDescendantOf` 使用 visited 终止环；不会只依赖任意业务层级常量。
- [`handleFindAncestorsUpdate`](../../../packages/rxdb-plugin-tree/src/query/merge-update-tree.ts) 对父链移动、where 翻转导致的不可局部恢复场景请求 SQL 重算。
- [`merge_remove`](../../../packages/rxdb-plugin-tree/src/query/merge_remove.ts) 对列表的删除既看结果成员也看关系影响；但 CREATE 以及计数仍漏了基准成员特殊语义，见 TREE-001；计数 REMOVE 侧同族漏洞见 TREE-002。

- [`TreeRepository.#normalizeOptions`](../../../packages/rxdb-plugin-tree/src/repository/TreeRepository.ts) 保留基准节点语义；[`merge_create`](../../../packages/rxdb-plugin-tree/src/query/merge_create.ts) 在刷新匹配与本地重算两处都应用 where，因此只修其中一层不能关闭 TREE-001。

- 2026-10-29 变更（ade2da5f，#167/US-032）：[`merge_update`](../../../packages/rxdb-plugin-tree/src/query/merge_update.ts) 向核心 [`query_need_refresh_update`](../../../packages/rxdb/src/query/need_refresh_update.ts) 声明 `TREE_READ_FIELDS = ['parentId']`——冷缓存的稀疏补丁补不齐父列时回 SQL，不再把缺失 `parentId` 读成根；recalculate 只收本任务实体类型的事件（`result.current_entities`），关系实体事件不再并入树增量。处理器改用单参 [`getSerializedBefore`](../../../packages/rxdb/src/query/merge-update.utils.ts)（核心 foldUpdate 先合并同 id 事件，前态按 id 取），与本轮核心合同一致。

## 问题

### TREE-001 [P2] 创建不匹配 where 的基准根节点时，实时列表和计数不更新

**证据**：[`merge_create`](../../../packages/rxdb-plugin-tree/src/query/merge_create.ts) 的刷新/增量规则依赖 `match_where`，`_recalculate` 入口再次对全部新建行执行 `isEntityMatchWhere`。而 [generate_tree_sql](../../../packages/rxdb-adapter-sqlite-core/src/query/query_tree_sql.ts) 的基准 SELECT 只用 `parentId IS NULL` 或目标 id，where 仅放在递归 SELECT。这意味着基准根/目标本应被包含，即使它不匹配 where。

**触发**：订阅 `findDescendants({entityId:null, where:{combinator:'and',rules:[{field:'active',operator:'=',value:true}]}})` 与同条件 countDescendants；在空库创建 `{id:'r',parentId:null,active:false}`。

**预期 / 实际**：SQL 重查包含根 r，计数 1；实时增量保持空数组和 0，直到其他事件或强制重查才恢复。显式 entityId 的基准节点从不存在变为存在也有同一入口问题。

**实证**（2026-10-28 轮）：调用真实核心 `createHarnessQueryTask` 与当时源码转译后的 `merge_create`，事件携带真实 entityType；两个任务均只发射初值一次，结果为 `findDescendants=[]`、`countDescendants=0`。对照 SQL 基准 SELECT 确认应包含根。该诊断验证真实核心匹配器与插件合并器组合，未把替身的 where 结论写死。

**修复建议**：让基准成员资格参与 CREATE 判定，避免以递归成员 where 过滤基准；无法局部确定时重跑 SQL。同步核对计数 REMOVE 对不匹配 where 的根删除是否走同一个漏洞。

**回归建议**：where 不匹配的新根、显式目标新增、同条件计数；分别验证即时结果与重新执行 SQL 一致，覆盖 level=0 和 id=0。

**2026-10-29 复核：仍有效。** [`merge_create`](../../../packages/rxdb-plugin-tree/src/query/merge_create.ts) 与 sqlite-core 的 [generate_tree_sql](../../../packages/rxdb-adapter-sqlite-core/src/query/query_tree_sql.ts) 本轮均未变更：`_recalculate` 仍先按 `isEntityMatchWhere(e.patch, where)` 过滤新建行、count 分支仍只按 `match_where` 刷新；SQL 基准成员仍只判 `parentId IS NULL` / `id = ?`，where 只在递归成员。本轮变更（#167）只动 UPDATE 门控，不触及 CREATE 路径。

### TREE-002 [P2] 删除不匹配 where 的基准成员时，实时计数不更新

与 TREE-001 同族：计数合并的触发条件按 where 命中构建，缺少基准成员语义。TREE-001 回归建议「同步核对计数 REMOVE 对不匹配 where 的根删除是否走同一个漏洞」经本轮静态推导确认成立。

**证据**：[`merge_remove`](../../../packages/rxdb-plugin-tree/src/query/merge_remove.ts) 的 count 分支 `refresh_rules` 只有 `['match_where']`、`['match_relation_where']`；核心 [`QueryRulesBuilder.buildRemoveRules`](../../../packages/rxdb/src/query/query-rules-builder.ts) 的 `match_where` 按被删行快照 `isEntityMatchWhere(inversePatch, where)` 判定，[`runMatches`](../../../packages/rxdb/src/query/query-matching.utils.ts) 要求组内规则全真才 refresh。而 [generate_tree_sql](../../../packages/rxdb-adapter-sqlite-core/src/query/query_tree_sql.ts) 的基准成员（查全树时 `parentId IS NULL` 的根、显式 entityId 的目标）不过 where、恒在 CTE 内。

**触发**：订阅 `countDescendants({entityId:null, where:{active=true}})`，库中只有不匹配 where 的根 r 且无子节点（SQL 计数 1），删除 r。或订阅 `countAncestors({entityId:'t', where:{active=true}})`，t 不匹配 where 但有匹配的祖先（计数 n>0），删除 t（祖先不受级联影响）。

**预期 / 实际**：SQL 重查为 0；实际被删行不匹配 where → `match_where` 为假 → 不 refresh 也不 recalculate，活计数停在旧值直到其他事件强制重查。find* 列表路径因 `result_contains` 参与判定不受影响；上述两个场景是纯基准成员删除，不依赖级联事件是否逐个上报。

**验证方式**：静态推导，沿 merge_remove → query_need_refresh_remove → buildRemoveRules → runMatches 与 generate_tree_sql 基准成员口径逐环核对。本轮约束下未运行 harness 组合诊断（禁止并发运行测试）；修复时可复用 TREE-001 的组合诊断方法复现。

**修复建议**：count REMOVE 触发条件补基准成员语义——全树模式下被删行 `parentId === null`、或显式 `entityId` 目标被删时无条件 refresh；`inversePatch` 是删除前完整快照，父列可直接读取。修复后同步复核 count CREATE 侧（TREE-001）能否共用同一判定。

**回归建议**：全树 countDescendants 删不匹配 where 的根（含 id=0）、显式目标 countAncestors 删不匹配 where 的目标；分别断言即时结果与重新执行 SQL 一致，并保留「删除匹配 where 的普通行」原有刷新行为。

## 验证证据与边界

- 静态证据：逐一读取上述符号的实现，并沿对应调用链核对；未修改产品代码或既有测试。
- 发现仓库测试文件 20 份；文件数仅描述现有测试入口，不等于本次覆盖率。
- 首轮（2026-10-28）`rxdb-plugin-tree:test`：7 passed (7)；目标实际执行。命令及整体边界见[总索引](README.md)。
- 已对核心查询 harness + 当前 CREATE 合并器做组合诊断；真实后端基准行为由当前 SQL 源码对照，尚未逐后端复跑新增场景。TREE-001 不在三个框架薄包装里重复计数。
- 2026-10-29 更新：[`merge_tree_update.browser.spec.ts`](../../../packages/rxdb-plugin-tree/src/__tests__/query/merge_tree_update.browser.spec.ts) 新增 57 行、3 个用例（findDescendants / countDescendants 冷缓存稀疏补丁回 SQL、只改无关列不触发 SQL），经真实 QueryManager 与生产 serialize 验证 #167 门控。TREE-002 为本轮静态推导结论，未运行 harness 组合诊断（本轮禁止并发运行测试），建议修复时按 TREE-001 的组合诊断方法复现后再落库。
