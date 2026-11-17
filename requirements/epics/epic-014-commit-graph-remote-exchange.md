---
id: epic-014-commit-graph-remote-exchange
status: Backlog
startDate: TBD
targetDate: TBD
owner: jimmy
---

# 提交图远端交换与草稿回写

## 愿景

让 working-tree 的本地提交图能与外部权威提交图交换：原样导入服务端下发的提交（保留 ID、父链、作者与内容指纹，含合并提交），并让 `discard()` / `restore()` 的结果直接体现在业务表里，使产品可以把「团队任务草稿」直接落在工作树上，而不必另写一套提交存储。首个使用方是 Admin 产品的 [ADMIN-US-221](../../rxdb-admin-template/requirements/stories/collaboration/ADMIN-US-221-task-drafts-on-working-tree.md)。

## 为什么单列一个 Epic

[epic-006](epic-006-working-tree-commits.md) 把 v1 定为纯本地的工作树与提交历史：远端 push / pull、冲突解决 UI 都是它的非目标，`discard()` 只回滚逻辑工作树也是 v1 有意划定的边界。本 Epic 跨过这些边界，并新增受信写意图，需要独立的范围评审与发布门禁，不能作为 epic-006 的顺延项悄悄扩大 v1。

## 目标

- [ ] 导入远端提交并快进分支头，保留提交身份，支持多父合并提交（[US-316](../stories/collaboration/US-316-remote-commit-import.md)）。
- [ ] `discard()` / `restore()` 回写业务表，查询结果与工作树状态一致（[US-317](../stories/collaboration/US-317-discard-restore-projection.md)）。

## 故事

> 本清单只列范围，**不带状态**。状态见 [status-overview](../status-overview.md)（真相源是各 story 的 YAML `status`）。

- [US-316 导入远端提交：保留提交身份并快进分支头](../stories/collaboration/US-316-remote-commit-import.md) (High)
- [US-317 放弃与恢复回写业务表](../stories/collaboration/US-317-discard-restore-projection.md) (High)

## 非目标

- 推送协议与服务端实现：导出沿用 `commits$` / `commitChanges()`，上传与权威裁决由使用方的服务端负责（Admin 产品见其协作包）。
- 三方字段级合并与「停在合并状态由用户裁决」：目前由使用方服务端执行，平台需要时另立故事。
- 可写检出位上的导入与同步：沿用 epic-006 的「只有主检出位同步」。
