# 媒体任务契约

## Create or replay

`PUT /api/relay/tasks/{taskId}`

请求必须携带现有 `x-relay-task-token` 和当前已登录平台账号的 Bearer session。任务 token 只在本机保存，不进入任务请求体、备份或同步。

新增多模态请求使用以下逻辑结构。

```text
{
  request: GenerationJobRequest,
  providerInstanceId: UUID,
  providerRevision: positive integer,
  modelId: string,
  input: MediaInputReference | null
}
```

`request` 的联合分支如下。

- `audio + text-to-speech`
- `audio + speech-to-text`
- `audio + text-to-music`
- `video + text-to-video`
- 现有图片请求继续通过兼容适配器接入

服务端根据目录项重新生成 provider URL、上游请求体和密钥注入，客户端提交的任何上游地址、密钥、临时路径或未声明字段都必须拒绝。

响应状态含义如下。

| HTTP  | 语义                                                 |
| ----- | ---------------------------------------------------- |
| `202` | 已完成原子积分预占并开始执行                         |
| `200` | 同一 `taskId` 和同一请求指纹的重复提交，返回当前状态 |
| `400` | 请求、目录参数或输入引用无效，未调用上游             |
| `401` | 未登录或 session 无效                                |
| `402` | 可用积分不足，未调用上游                             |
| `403` | 来源、账号或能力不可用                               |
| `409` | `taskId` 已经绑定不同请求，或任务已封存              |
| `503` | 平台目录、任务存储或运行时未就绪                     |

## Status

`GET /api/relay/tasks/{taskId}?wait=25`

响应为不含敏感字段的 `RelayTaskView`。

```text
{
  status: queued | processing | completed | failed | needs_review,
  upstreamStatus: number | null,
  updatedAt: ISO timestamp,
  result: MediaResultManifest | TranscriptResult | null,
  failure: { category, retryable, providerRequestId? } | null,
  creditState: reserved | charged | released | null
}
```

现有图片 status 消费者可以继续读取原有 `status`、`upstreamStatus` 和 `updatedAt` 字段。新增字段必须可选，不能改变图片响应的原有语义。

## Result and settlement

- `GET /api/relay/tasks/{taskId}/result` 返回 Transcript JSON 或真实音频、视频二进制。
- `POST /api/relay/tasks/{taskId}/confirm` 只在客户端完成结果完整性校验后调用，重复调用必须幂等。
- `POST /api/relay/tasks/{taskId}/discard` 用于结果无法验证或本机明确放弃，释放预占。已进入 `needs_review` 的任务不能自动调用此接口覆盖未知结果。
- `POST /api/relay/tasks/{taskId}/abandon` 只用于接单应答未知时登记原任务，不创建新任务。
- `DELETE /api/relay/tasks/{taskId}` 在任务不再需要且已完成结算后删除服务端任务、结果对象和输入对象。

上游拒绝、超时、5xx、空结果、无法解码和未知回执必须映射到明确失败分类。未知回执进入 `needs_review`，禁止自动重发。
