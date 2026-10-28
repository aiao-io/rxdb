---
id: US-527
title: 工作台备份恢复闭环：失败语义与数据保留
status: Done
priority: Low
epic: epic-010-model-driven-admin-framework
created: 2026-10-19
updated: 2026-10-28
tags: [domain, admin-framework, backup, restore]
---

# 用户故事：工作台备份恢复闭环：失败语义与数据保留

## 作为/我想要/以便

**作为** 工作台使用者
**我想要** 一键备份本地数据、在独立环境恢复后继续查询与编辑
**以便** 换设备或浏览器清数据后不丢数据，且备份失败时清楚数据保留状态

## 交付阶段

| 阶段 | 内容                                                                 | 状态 |
| ---- | -------------------------------------------------------------------- | ---- |
| A    | 备份入口：导出一致性归档到文件，成功 / 失败反馈                      | ✅   |
| B    | 恢复入口：独立环境导入归档、继续查询编辑；失败原因与数据保留状态明确 | ✅   |

阶段归属：A 关闭 AC#1 / #2；B 关闭 AC#3 / #4。

## 范围边界

### In Scope

- 复用 [US-217](../adapter/US-217-local-database-backup-restore.md) 已交付的备份 / 恢复能力
  （[`RxDBBackupResult`](../../../packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts) 及其错误分类），
  本故事只做工作台接线：入口、进度 / 结果反馈与失败语义
- 备份产物落到用户文件（下载），恢复从用户文件读入
- 失败结果明确：备份失败（存储满 / IO 错误）与恢复失败（归档损坏 / 能力组合不支持 / 恢复中断）
  都给出可读原因
- 数据保留状态明确：已有库禁止开始恢复，拒绝后原数据仍可查询与编辑；恢复只写未初始化的空目标，
  中断后明确提示残留与清理入口，不把未完成目标当恢复成功；恢复成功以导入归档为准
- 独立环境 = 另一浏览器 profile 上的同宿主应用，同 adapter 恢复（跨 adapter 恢复不在 US-217 承诺内，
  本故事沿用）

### Out of Scope

- 备份 / 恢复引擎能力与错误分类（→ US-217，已 Done）
- 外置文件（附件字节）进入归档（US-217 明确不在归档内）
- 自动定时备份、云端备份

## 验收标准

| #   | 前置条件                                                 | 操作                   | 预期结果                                                         | 状态 |
| --- | -------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------- | ---- |
| 1   | 工作台有数据                                             | 触发备份并保存归档文件 | 下载得到归档；界面给出成功反馈                                   | ✅   |
| 2   | 备份调用失败（故障注入模拟 `storage_full` / `io_error`） | 触发备份               | 给出可读失败原因（存储满 / IO 错误）；当前库不受影响、可继续使用 | ✅   |
| 3   | 独立环境（另一 profile）启动工作台，持有归档             | 导入归档               | 行数与关联完整恢复；可继续查询、编辑；刷新重开数据仍在           | ✅   |
| 4   | 恢复失败（归档损坏 / 能力组合不支持）                    | 导入非法归档           | 给出可读失败原因；**原库数据保留不变**、仍可查询与编辑           | ✅   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术笔记

US-217 已交付的契约（证据见其[阶段 A / B 验收记录](../adapter/US-217-local-database-backup-restore.md)）：
`backup(sink, options)` 产出一致性归档与 `RxDBBackupResult`；恢复端按能力分诊——客户端缺少
`setChangeEventsMuted` / `describeBlankDatabase` 时报 `unsupported_combination`，中断恢复报
`restore_incomplete`，目标打不开经 `classifyBackupIoError` 落 `storage_full` / `io_error`。
本故事把「引擎报错」翻译成「用户读得懂的失败结果」与「数据保留状态」，不新增引擎抽象。

**恢复失败的数据保留语义**（AC#4）：已有库在写入前被拒，原数据不变；空目标写入中断可能留下
未完成数据，界面按 `restore_incomplete` / `cleanup_pending` 提供清理后重试入口，不承诺恢复事务整体回滚。

工作台首页在任何列表或搜索查询之前提供「打开工作台」与「从备份恢复」入口。恢复路径先导入，
再连接；已初始化的目标即使没有业务记录，也不再满足空目标契约。刷新不能清空目标，界面应指引用户
在新浏览器配置中从首页选择恢复。备份、恢复与清理残留互斥，操作完成或失败后释放入口。

**已知限制**：备份归档先在页面内存里拼成 Blob 再交给浏览器下载，库大到超出标签页可用内存时备份会失败。
引擎的 `backup(sink)` 本身是流式的；工作台首版只提供 Blob 下载，流式写盘与相应浏览器范围需另行验证。

## 价值待证

本故事已随 [epic-010 解锁记录](../../epics/epic-010-model-driven-admin-framework.md#价值待证整个-epic) 解锁
（2026-10-21，owner 决定）：三条故事不新增引擎抽象、对应零个已知病灶，「病灶数 ≥ 抽象数」按 owner
决定豁免，依据与边界见 epic。

## 实现文件

- `apps/dev-rxdb-admin/` — 备份 / 恢复入口与失败语义接线（随 US-526 的应用壳）
- `apps/dev-rxdb-admin-e2e/` — 备份 → 独立环境恢复的端到端用例

## References

- [合入 PR #152](https://github.com/aiao-io/rxdb/pull/152)
- [备份与独立环境恢复验收](../../../apps/dev-rxdb-admin-e2e/src/backup-restore.spec.ts) — 下载、故障注入、独立浏览器上下文恢复与已有库保留
- [备份错误分类断言](../../../apps/dev-rxdb-admin/src/app/backup/backup-ops.spec.ts) · [恢复中断与清理入口断言](../../../apps/dev-rxdb-admin/src/app/pages/backup-page.spec.tsx)
- [epic-010 模型驱动后台管理框架](../../epics/epic-010-model-driven-admin-framework.md)
- [admin-framework 候选分析](../../domain-research/admin-framework.md) — 设计依据（首版边界第 4 条）
- [US-217 本地数据库一致性备份与恢复](../adapter/US-217-local-database-backup-restore.md) — 前置（已 Done）；只承诺同 adapter 恢复
- [US-526 模型驱动数据工作台](US-526-admin-workbench.md) — 前置：工作台应用壳
- [`RxDBBackupResult`](../../../packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts) — 备份结果契约的证据锚点
