---
id: ADMIN-US-211
title: 三方冲突检测与合并预览
status: Backlog
priority: High
epic: ADMIN-EPIC-003
created: 2026-11-16
updated: 2026-11-16
tags: [admin, data-pr, conflict, merge, preview, collaboration]
dependsOn: [ADMIN-US-210]
capabilities: [rxdb:US-308, rxdb:US-312]
---

# 用户故事：三方冲突检测与合并预览

## 作为/我想要/以便

**作为** 数据 PR 作者、审核者或合并者
**我想要** 基于共同起点、草稿和当前共享数据查看冲突并选择结果
**以便** 在合并前处理并发修改，不让一方的字段变化被静默覆盖。

## 范围边界

### In Scope

- 使用共同起点、来源草稿和当前共享分支进行三方比较。
- 不同字段的并发修改可以自动合并；同一字段的冲突必须显式处理。
- 冲突处理支持选择草稿值、共享值或输入新值，并展示最终合并预览。
- 处理关联删除与编辑、唯一性和引用关系冲突；未解决冲突阻塞合并。
- 目标共享版本变化后重新计算冲突，旧的选择不能无条件复用。

### Out of Scope

- 二进制文件、任意文本文件或跨任务的智能语义合并。
- 在预览阶段直接写入共享数据。

## 验收标准

| # | 前置条件 | 操作 | 预期结果 | 状态 |
| --- | --- | --- | --- | --- |
| 1 | 目标共享版本未改变，草稿只修改了草稿侧字段 | 打开合并预览 | 预览显示草稿变更且无冲突；共享数据仍不变 | ⬜ |
| 2 | 草稿和共享数据修改同一记录的不同字段 | 运行三方比较 | 系统自动合并不同字段，并在预览中显示最终各字段值 | ⬜ |
| 3 | 草稿和共享数据修改同一字段 | 查看冲突并选择结果 | 显示共同起点、草稿值和共享值；用户可以选择任一值或输入新值，未选择前阻塞合并 | ⬜ |
| 4 | 一方删除关联父记录，另一方编辑父或子记录 | 运行冲突和完整性检查 | 用业务语言说明影响并要求处理，不能静默丢弃编辑或关联记录 | ⬜ |
| 5 | 用户已经处理全部冲突 | 查看最终合并预览 | 明确列出将新增、修改、删除的最终结果；结果可追溯到冲突选择 | ⬜ |
| 6 | 预览完成后目标共享分支产生新版本 | 尝试继续合并 | 标记预览过期并重新计算；旧选择不能直接覆盖新版本 | ⬜ |
| 7 | 用户仍在冲突处理界面 | 刷新或离线保存 | 已保存的选择保留在任务或 PR 草稿中，但没有伪称已经合并 | ⬜ |

验收证据：待实现后补充字段自动合并、同字段三选一、删除/编辑冲突、目标头变化和预览不写库的集成用例。

## 技术笔记

合并预览必须是纯读取或临时结果，不能调用最终写入路径。冲突结果需要带共同起点和目标头版本；服务端最终合并时再次执行三方比较和业务检查。现有工作树比较能力只能作为底层积木，不能代替团队权限、PR 版本和审计语义。

## 实现文件

- `apps/rxdb-admin-template-react/src/app/data-pr/merge/` — 冲突列表、三方值和最终预览。
- `apps/rxdb-admin-template-angular/src/app/data-pr/`、`apps/rxdb-admin-template-vue/src/app/data-pr/` — 三端等价入口。
- `packages/rxdb-plugin-working-tree/` — 分支比较和冲突基础能力。
- `supabase/` — 服务端版本校验和最终合并事务。

## References

- [ADMIN-US-210](ADMIN-US-210-diff-checks.md)
- [ADMIN-US-212](ADMIN-US-212-authorized-atomic-merge.md)
- [分支隔离与跨 realm 冲突检测](../../../../../requirements/stories/collaboration/US-308-branch-isolation-conflict.md)
- [分支比较与合并预览](../../../../../requirements/stories/collaboration/US-312-branch-compare-merge-preview.md)
- [ADMIN-EPIC-003](../../epics/ADMIN-EPIC-003.md)
