# Contract: apply_media_config_commit RPC

## Signature

```sql
public.apply_media_config_commit(
  p_commit_id uuid,
  p_operation_id uuid
) returns jsonb
```

## Preconditions

- 调用者是有效管理员或授权后台服务身份。
- commit 存在且属于调用者 workspace。
- commit 状态为 `synced` 或 `validated`。
- 所有 `media_config_commit_changes` 已到齐且序号连续。
- 父提交存在并与当前分支一致。
- 每个 change 的 fingerprint 和 expected revision 通过校验。

## Atomic behavior

同一数据库事务内：

1. 锁定 commit 和目标配置行；
2. 校验操作幂等记录；
3. 应用全部 patch 或全部拒绝；
4. 写入配置 revision；
5. 写入不可变审计事件；
6. 更新 commit status 和 appliedAt；
7. 返回应用后的实体 revision。

## Idempotency

相同 `(workspace_id, p_operation_id)` 重试必须返回首次结果，不重复应用 patch 或审计。

## Error codes

- `42501`: 无权应用配置；
- `40001`: revision 冲突；
- `22023`: commit envelope 不完整或 fingerprint 错误；
- `23505`: 幂等操作已存在，返回已有结果；
- `P0002`: commit 或变更不存在。
