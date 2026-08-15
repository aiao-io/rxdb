---
id: epic-002-data-sync
status: Done
startDate: 2025-04-01
targetDate: 2026-06-01
owner: jimmy
---

# 数据同步与协作

## 愿景

实现设备和用户之间的数据同步，支持离线优先的工作流和类 Git 的版本管理

## 目标

- [x] 类 Git 版本控制（分支/合并/切换）
- [x] 撤销/重做操作
- [x] 变更压缩与增量同步
- [x] 与 Supabase 的远程同步
- [x] 冲突解决策略 (LWW + 可插拔 Resolver)

## 故事

- ✅ [US-301 版本控制](../stories/collaboration/US-301-version-control.md) (Medium)
- ✅ [US-302 撤销/重做](../stories/collaboration/US-302-undo-redo.md) (Medium)
- ✅ [US-203 Supabase 适配器](../stories/adapter/US-203-supabase-adapter.md) (High)
- ✅ [US-803 本地数据加密](../stories/future/US-803-local-encryption.md) (Medium) — `@aiao/rxdb-adapter-encrypted` 透明加密包装层

> 原挂在本 Epic 下的 US-305「持久化 Git 式工作区提交」已升级为
> [epic-006 本地工作树与提交历史](./epic-006-working-tree-commits.md) 并拆成 US-305～US-308；
> 2026-08-15 又把仍然过大的 US-306 拆为 US-306a/b/c，US-306 本体保留为父契约。
> 本 Epic 的 `status: Done` 因此成立——它不再持有未完成故事。
