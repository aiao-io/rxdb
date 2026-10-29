# rxdb-plugin-history 深度评审

- 包：`@aiao/rxdb-plugin-history`
- 日期：2026-10-29
- 基线：`f62f77c19d55c73d8335df026778422282c2fed4`
- 结论：🟢好。本次已审范围未发现新增确定缺陷；2026-10-29 更新轮同样无新增，不代表全部路径无缺陷。

## 评审计划与实际范围

审查分支切换前置条件、失败事件、继承变更的撤销边界、undo/redo 原子应用、redo 栈与同步历史桥；比较当前实现和已清理评审记录，避免复报已修的数据破坏问题。

## 核查结果

- [`VersionManager.switchBranch`](../../../packages/rxdb-plugin-history/src/VersionManager.ts) 在适配器 prepare 中重新核对表集与持有分支；提交后的错误不会伪装成回滚事件。
- [`applyUndoRedoHistories`](../../../packages/rxdb-plugin-history/src/undo-redo-apply.ts) 对继承 floor 与 undo session 在写事务中再次校验，过期选择不会继续应用。
- [`fetchLatestHistories`](../../../packages/rxdb-plugin-history/src/undo-redo-apply.ts) 结合本地同步水位与 pushInFlight 快照约束候选，避免已推送变更重新成为可撤销项。
- [`RedoStack.push`](../../../packages/rxdb-plugin-history/src/redo-stack.ts) 限制最大栈大小；remove 按 fingerprint 精确移除。
- [US-315](../../stories/collaboration/US-315-undo-inherited-change-switch-corruption.md) 当前 `status: Done`；继承 floor 防线已落在上述源码，本次不把 README 的历史遗留叙述当成当前未修漏洞。

- [`table_set_scope` / `keep_table_set_actions`](../../../packages/rxdb-plugin-history/src/table-set-scope.ts) 让影子检出位只重放本表集成员；[`buildLastPushedMap`](../../../packages/rxdb-plugin-history/src/history-filters.ts) 合并持久水位与在飞认领，未把已推变更重新纳入可撤销集合。

## 问题

本次未发现可给出确定触发链的新增包内问题。

2026-10-29 更新轮：基线 `7bb16a9` → `f62f77c19d55c73d8335df026778422282c2fed4` 区间本包无源码变更；抽查 [`applyUndoRedoHistories`](../../../packages/rxdb-plugin-history/src/undo-redo-apply.ts) 的写事务前置复核、[`fetchLatestHistories`](../../../packages/rxdb-plugin-history/src/undo-redo-apply.ts) 的水位与在飞认领约束、[`RedoStack`](../../../packages/rxdb-plugin-history/src/redo-stack.ts) 的容量与指纹移除、[`table_set_scope` / `keep_table_set_actions`](../../../packages/rxdb-plugin-history/src/table-set-scope.ts) 的成员过滤，均与报告描述一致，本更新轮未发现新的确定问题。

## 验证证据与边界

- 静态证据：逐一读取上述符号的实现，并沿对应调用链核对；未修改产品代码或既有测试。
- 发现仓库测试文件 32 份；文件数仅描述现有测试入口，不等于本次覆盖率。
- 首轮（2026-10-28）`rxdb-plugin-history:test`：439 passed (439)；目标实际执行。命令及整体边界见[总索引](README.md)。
- 分支对比/预览没有单事务一致快照属于仓库已有接受边界；未要求在本次文档评审中改变语义。未证明所有后端的 switchBranch prepare 都正确实现，本包只核查调用和防线。
