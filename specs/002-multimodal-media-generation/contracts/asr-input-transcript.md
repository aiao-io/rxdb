# ASR 输入与 Transcript 契约

## Upload input

`POST /api/media/inputs`

请求体是原始音频字节，`Content-Type` 必须是目录允许的 MIME。请求需要当前已登录平台账号和同源写来源。客户端可以提供长度和 SHA-256 提示，但服务端必须重新读取并计算。

响应为短期 `MediaInputReference`。

```text
{
  id: UUID,
  mediaType: string,
  bytes: positive integer,
  durationMs: positive integer,
  sha256: 64 lowercase hex characters,
  expiresAt: ISO timestamp
}
```

服务端约束如下。

- 输入对象使用私有 key `inputs/<id>`。
- 输入必须绑定当前用户，并限制最大字节数、时长和格式。
- 原始音频不进入任务摘要、日志、备份、同步或客户端构建物。
- 输入在任务终态、过期或显式删除后清理。
- 清理失败必须进入可重试的服务端恢复路径，不能让客户端重复上传来补偿。

## Delete input

`DELETE /api/media/inputs/{inputId}`

删除操作幂等。任务已经引用的输入由服务端生命周期管理，客户端不能通过删除输入改变已接单任务的请求内容。

## ASR request

```text
{
  kind: audio,
  operation: speech-to-text,
  providerInstanceId: UUID,
  providerRevision: positive integer,
  modelId: string,
  language: string | null,
  input: MediaInputReference
}
```

`language: null` 表示服务端自动识别。服务端必须根据 input id 重新读取对象并比较所有权、SHA-256、MIME、字节数和时长。

## Transcript response

```text
{
  kind: transcript,
  text: string,
  language: string,
  detectedLanguage: boolean,
  characters: positive integer,
  sha256: 64 lowercase hex characters
}
```

`text` 必须是非空规范化文本。空结果应转为明确失败并保留 provider request id，不能当作成功的空 Transcript。首期不支持时间戳、分段、说话人分离、置信度和流式识别。

## Browser behavior

- 结果面板显示语言、文本和任务状态。
- 文本支持复制和下载为 UTF-8 `.txt`。
- 复制、下载和本机保存失败必须显示操作级错误，不重新提交 ASR。
- 刷新后使用原任务 ID 找回 Transcript。输入上传不会因为页面刷新自动重复。
