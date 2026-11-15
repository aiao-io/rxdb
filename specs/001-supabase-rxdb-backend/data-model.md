# Data Model: Supabase-first 后台与 RxDB 同步架构

## 1. AdminSession

| 字段 | 类型 | 约束 |
| --- | --- | --- |
| `userId` | UUID | 来自已验证会话，不能来自请求体 |
| `email` | string | 展示用 |
| `expiresAt` | timestamp | 到期后必须刷新或退出 |
| `accountState` | enum | active/disabled/revoked |
| `membership` | enum | admin/none |

数据来源：Supabase Auth 会话和受保护的管理员 membership 查询。

## 2. BusinessEntity

第一阶段实体：

- `MediaPromptTemplate`
- `MediaProviderPolicy`
- `MediaPlatformModel`
- 工作区配置
- 任务和用量投影

公共字段：

| 字段 | 类型 | 约束 |
| --- | --- | --- |
| `id` | UUID/string | 稳定主键 |
| `workspaceId` | UUID | RLS tenant 边界 |
| `revision` | bigint | CAS/冲突判断 |
| `createdBy` | UUID | 审计字段 |
| `updatedBy` | UUID | 审计字段 |
| `createdAt` | timestamp | 服务端生成或校验 |
| `updatedAt` | timestamp | 服务端生成或校验 |
| `branchId` | string/null | 配置实体的分支上下文 |
| `deletedAt` | timestamp/null | 可复制 tombstone |

## 3. SyncCheckpoint

由 RxDB sync plugin 和 Supabase adapter 管理，不直接作为 Admin UI 业务对象：

- remote backend identity；
- pull cursor；
- last pushed change ID；
- branch cursor；
- last successful sync timestamp；
- paused/error state。

远端基础设施：`rxdb_change`、`rxdb_branch`、`rxdb_backend`。

## 4. ConfigBranch

| 字段 | 类型 | 约束 |
| --- | --- | --- |
| `id` | string | 唯一分支 ID |
| `workspaceId` | UUID | RLS tenant 边界 |
| `parentId` | string/null | 父分支 |
| `baseCommitId` | UUID/null | 分支起点 |
| `active` | boolean | 由分支协议维护 |
| `createdBy` | UUID | 创建者 |
| `createdAt` | timestamp | 不可变 |

可映射到现有 `rxdb_branch` 元数据，但领域表需保存 workspace 和权限上下文。

## 5. MediaConfigCommit

领域级提交投影，不是 RxDB 内部 `Commit` 的直接镜像。

| 字段 | 类型 | 约束 |
| --- | --- | --- |
| `id` | UUID | 唯一 commit identity |
| `workspaceId` | UUID | RLS tenant 边界 |
| `branchId` | string | 所属分支 |
| `parentIds` | UUID[] | 有序或规范化父提交列表 |
| `authorId` | UUID | 已验证操作者 |
| `message` | string | 长度受限 |
| `operationId` | UUID | 幂等应用标识 |
| `contentFingerprint` | string | 由提交内容计算 |
| `status` | enum | prepared/synced/validated/applied/released/rejected |
| `createdAt` | timestamp | 不可变 |
| `appliedAt` | timestamp/null | 应用时间 |
| `releasedAt` | timestamp/null | 发布时间 |
| `rejectionCode` | string/null | 可观察拒绝原因 |

唯一约束：`(workspaceId, id)`、`(workspaceId, operationId)`。

## 6. MediaConfigCommitChange

| 字段 | 类型 | 约束 |
| --- | --- | --- |
| `id` | UUID | 唯一变更 ID |
| `commitId` | UUID | 引用提交 |
| `sequence` | integer | 提交内唯一递增序号 |
| `entity` | string | 领域实体名 |
| `entityId` | UUID/string | 领域实体 ID |
| `operation` | enum | insert/update/delete |
| `patch` | JSON | 应用变更 |
| `inversePatch` | JSON/null | 回滚变更 |
| `expectedRevision` | bigint/null | CAS 预期版本 |
| `contentFingerprint` | string | 单变更摘要 |

唯一约束：`(commitId, sequence)`。

## 7. GenerationTask

复用现有任务表/契约，PGMQ 只引用它：

- `taskId`；
- `taskRevision`；
- account/workspace owner；
- credit hold/settlement state；
- task state；
- result reference；
- provider idempotency key；
- retry count；
- expiresAt。

## 8. PgmqMessage

消息内容只允许：

```json
{
  "taskId": "uuid",
  "taskRevision": 3,
  "kind": "image-generation"
}
```

禁止：provider key、Supabase session、完整提示词、原始图片、大型结果。

## State transitions

### Config commit

```text
prepared -> synced -> validated -> applied -> released
                         └-------> rejected
```

### Generation task

复用现有 `queued/running/succeeded/failed/expired` 及积分预留/确认/释放状态；PGMQ 的消息状态不能替代业务任务状态。

## Consistency rules

1. 业务实体更新必须带 revision/CAS。
2. commit projection 只在完整 envelope 到达后进入 `validated`。
3. `apply_media_config_commit(commitId, operationId)` 必须原子更新配置、审计和 commit 状态。
4. 重复 `operationId` 返回首次结果，不重复副作用。
5. 后台同步身份不能绕过 RLS。
6. PGMQ 重复投递由 task CAS、结果唯一约束、积分状态和 provider 幂等键收敛。
