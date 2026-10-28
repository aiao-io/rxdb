# rxdb-plugin-tree 深度评审

- 包：`@aiao/rxdb-plugin-tree`
- 日期：2026-10-28
- 基线：`7bb16a9014095d4003bd059244722013b36867c1`
- 结论：🟡凑合。新增确定问题见下文。

## 评审计划与实际范围

对比树仓储与 SQL 的基准成员、递归成员、where、level、计数约定，检查 CREATE/UPDATE/REMOVE 增量合并及环保护，并对三端透传方式复核。

## 核查结果

- [`TreeRepository.#normalizeOptions`](../../../packages/rxdb-plugin-tree/src/repository/TreeRepository.ts) 统一校验非负安全整数 level，并用 nullish 判定保留整数 id=0。
- [`traverseAncestors`](../../../packages/rxdb-plugin-tree/src/query/query-tree.utils.ts) 和 `isDescendantOf` 使用 visited 终止环；不会只依赖任意业务层级常量。
- [`handleFindAncestorsUpdate`](../../../packages/rxdb-plugin-tree/src/query/merge-update-tree.ts) 对父链移动、where 翻转导致的不可局部恢复场景请求 SQL 重算。
- [`merge_remove`](../../../packages/rxdb-plugin-tree/src/query/merge_remove.ts) 对列表的删除既看结果成员也看关系影响；但 CREATE 以及计数仍漏了基准成员特殊语义，见 TREE-001。

- [`TreeRepository.#normalizeOptions`](../../../packages/rxdb-plugin-tree/src/repository/TreeRepository.ts) 保留基准节点语义；[`merge_create`](../../../packages/rxdb-plugin-tree/src/query/merge_create.ts) 在刷新匹配与本地重算两处都应用 where，因此只修其中一层不能关闭 TREE-001。

## 问题

### TREE-001 [P2] 创建不匹配 where 的基准根节点时，实时列表和计数不更新

**证据**：[`merge_create`](../../../packages/rxdb-plugin-tree/src/query/merge_create.ts) 的刷新/增量规则依赖 `match_where`，`_recalculate` 入口再次对全部新建行执行 `isEntityMatchWhere`。而 [generate_tree_sql](../../../packages/rxdb-adapter-sqlite-core/src/query/query_tree_sql.ts) 的基准 SELECT 只用 `parentId IS NULL` 或目标 id，where 仅放在递归 SELECT。这意味着基准根/目标本应被包含，即使它不匹配 where。

**触发**：订阅 `findDescendants({entityId:null, where:{combinator:'and',rules:[{field:'active',operator:'=',value:true}]}})` 与同条件 countDescendants；在空库创建 `{id:'r',parentId:null,active:false}`。

**预期 / 实际**：SQL 重查包含根 r，计数 1；实时增量保持空数组和 0，直到其他事件或强制重查才恢复。显式 entityId 的基准节点从不存在变为存在也有同一入口问题。

**实证**：本轮调用真实核心 `createHarnessQueryTask` 与当前源码转译后的 `merge_create`，事件携带真实 entityType；两个任务均只发射初值一次，结果为 `findDescendants=[]`、`countDescendants=0`。对照 SQL 基准 SELECT 确认应包含根。该诊断验证真实核心匹配器与插件合并器组合，未把替身的 where 结论写死。

**修复建议**：让基准成员资格参与 CREATE 判定，避免以递归成员 where 过滤基准；无法局部确定时重跑 SQL。同步核对计数 REMOVE 对不匹配 where 的根删除是否走同一个漏洞。

**回归建议**：where 不匹配的新根、显式目标新增、同条件计数；分别验证即时结果与重新执行 SQL 一致，覆盖 level=0 和 id=0。

## 验证证据与边界

- 静态证据：逐一读取上述符号的实现，并沿对应调用链核对；未修改产品代码或既有测试。
- 发现仓库测试文件 20 份；文件数仅描述现有测试入口，不等于本次覆盖率。
- 本次 `rxdb-plugin-tree:test`：7 passed (7)；目标实际执行。命令及整体边界见[总索引](README.md)。
- 已对核心查询 harness + 当前 CREATE 合并器做组合诊断；真实后端基准行为由当前 SQL 源码对照，尚未逐后端复跑新增场景。TREE-001 不在三个框架薄包装里重复计数。
