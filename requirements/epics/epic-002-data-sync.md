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
- ⬜ [US-305 持久化 Git 式工作区提交](../stories/collaboration/US-305-persistent-workspace-commits.md) (High)
- ✅ [US-203 Supabase 适配器](../stories/adapter/US-203-supabase-adapter.md) (High)
- ✅ [US-803 本地数据加密](../stories/future/US-803-local-encryption.md) (Medium) — `@aiao/rxdb-adapter-encrypted` 透明加密包装层
