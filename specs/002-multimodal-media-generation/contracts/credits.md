# 积分预占、结算与释放契约

## Existing interface

继续复用 `RelayCredits`。

- `reserve({ taskId, ownerId, cost, fingerprint, tokenHash })`
- `complete(taskId)`
- `release({ taskId, ownerId, cost, fingerprint, tokenHash })`

实现使用 `BackendRelayCredits` 和现有产品 RPC。

- `media_reserve_credits`
- `media_settle_credits`
- `media_abort_credits`

## Lifecycle

| 任务情况                             | 积分动作   | 任务语义                               |
| ------------------------------------ | ---------- | -------------------------------------- |
| 参数、目录或输入校验失败             | 不预占     | 请求在上游之前被拒绝                   |
| 登录有效且余额足够                   | 原子预占   | 任务进入 `queued` 或 `processing`      |
| 上游明确拒绝、确定超时或结果无法验证 | 释放       | 任务进入 `failed`                      |
| 收到可验证结果并确认                 | 结算一次   | 任务进入 `completed`，账本为 `charged` |
| 接单或结算应答未知                   | 保留预占   | 任务进入 `needs_review`，禁止自动重发  |
| 任务过期                             | 释放并清理 | 服务端 alarm 负责最终一致性            |

## Idempotency

- `taskId`、token hash、请求 fingerprint 三者共同保护重复提交。
- fingerprint 覆盖provider instance、能力版本、操作、模型、所有参数、规范化文本和 ASR 输入 SHA-256。
- 同一 fingerprint 的重复 `PUT` 返回原任务状态，不调用 provider，不重复预占。
- 同一任务的 `confirm`、`discard` 和 `release` 允许重复请求，但最终账本只能处于一个终态。
- 账本服务暂不可用时任务和 alarm 保留恢复信息，客户端不通过新任务规避错误。

## User-visible balance behavior

客户端在提交前刷新可用积分用于提示，但服务端原子预占是唯一准入判断。余额、预占和流水读取使用现有 `/api/credits`。任务卡片必须能够显示处理中、已结算、已释放和待核查状态。
