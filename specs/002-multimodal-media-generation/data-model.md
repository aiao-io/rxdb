# Phase 1 Data Model: Aiao Media 多模态媒体生成

## 模型边界

本模型把四类能力统一到 `MediaTask`，把 ASR 的输入音频和 Transcript 结果作为独立实体处理。图片的 `LocalImageWork`、现有任务 key、数据库名和 OPFS 根目录继续保留。音视频原文件与 ASR 文本只在当前设备保存，首期不接入现有图片远端同步表。

## 1. MediaCapabilityCatalogEntry

服务端维护、客户端只读的能力目录项。

| 字段                 | 类型                                                                                  | 约束                                       |
| -------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------ |
| `providerInstanceId` | UUID                                                                                  | 平台生成，稳定标识能力实例                 |
| `providerRevision`   | 正整数                                                                                | 参数和价格变更时递增                       |
| `kind`               | `image \| audio \| video`                                                             | 输入或输出媒体类别                         |
| `operation`          | `text-to-image \| text-to-speech \| speech-to-text \| text-to-music \| text-to-video` | 与 `kind` 组合后必须匹配                   |
| `label`              | string                                                                                | 面向用户显示，限制长度和控制字符           |
| `modelId`            | string                                                                                | 平台公开模型标识，不是上游型号             |
| `credits`            | 正整数                                                                                | 单次任务预占积分                           |
| `input`              | object                                                                                | 文本、音频 MIME、字节数、时长等限制        |
| `parameters`         | object                                                                                | 语言、声音、语速、风格、画幅、时长等允许值 |
| `output`             | object                                                                                | MIME、格式、时长、尺寸和文件大小限制       |
| `enabled`            | boolean                                                                               | 只有启用项进入公开目录                     |

服务端私有配置额外包含上游地址、上游模型、密钥引用和 provider protocol。私有字段永远不进入目录、任务快照、队列、日志、备份或同步数据。

## 2. MediaTask

一次平台媒体提交的逻辑任务。浏览器和服务端共享稳定任务 ID，服务端 Durable Object 只保存运行所需的摘要和状态。

| 字段                 | 类型                                                                       | 约束                                         |
| -------------------- | -------------------------------------------------------------------------- | -------------------------------------------- |
| `id`                 | UUID                                                                       | 客户端首次提交前生成，作为幂等身份           |
| `kind`               | `image \| audio \| video`                                                  | 与 `request.operation` 一致                  |
| `operation`          | operation union                                                            | 决定输入、输出和校验器                       |
| `providerInstanceId` | UUID                                                                       | 必须来自当前服务端目录                       |
| `providerRevision`   | 正整数                                                                     | 固定本次请求使用的目录版本                   |
| `modelId`            | string                                                                     | 与目录项一致                                 |
| `request`            | operation-specific request                                                 | 参数快照，不包含凭据、路径或供应商 URL       |
| `input`              | `MediaInputReference \| null`                                              | ASR 必填，其他操作为 null                    |
| `status`             | `queued \| processing \| completed \| failed \| needs_review \| cancelled` | 任务生命周期                                 |
| `delivery`           | delivery status                                                            | 服务端结果与本机保存分别追踪                 |
| `result`             | `MediaResultManifest \| TranscriptResult \| null`                          | 仅在服务端结果可验证后出现                   |
| `failure`            | `GenerationJobFailure \| null`                                             | 分类、是否可重试和安全的 provider request id |
| `createdAt`          | ISO timestamp                                                              | 服务端和客户端均校验格式                     |
| `updatedAt`          | ISO timestamp                                                              | 每次状态变化更新                             |
| `providerRequestId`  | string \| null                                                             | 仅允许经过清洗的关联标识                     |
| `creditState`        | `pending \| reserved \| charged \| released`                               | 仅在服务端内部账本任务记录出现               |

任务状态与结果状态的主要转换如下。

```text
created -> queued -> processing -> completed
                         |              |
                         |              v
                         |          delivery.available
                         v
                 failed / needs_review

completed -> local.saving -> local.ready
                     |             |
                     v             v
               local.broken   local.deleting -> removed
```

`needs_review` 不允许客户端自动重发。`completed` 只表示服务端结果通过规范化，不能代替本机保存成功。结果确认和积分结算在客户端完成一次后保持幂等。

## 3. Operation-specific requests

### TTS request

```text
kind: audio
operation: text-to-speech
providerInstanceId
providerRevision
modelId
language
voiceId
speed
text
```

- `language`、`voiceId` 和 `speed` 只能取目录声明的值。
- `text` 使用 TTS 目录的最大长度校验。
- 输出由目录声明，首期默认复用现有 WAV 校验器，若目录允许其他格式必须提供对应结果校验器。

### ASR request

```text
kind: audio
operation: speech-to-text
providerInstanceId
providerRevision
modelId
language: string | null
input: MediaInputReference
```

- `language: null` 表示服务端自动识别。
- 输入引用只包含 opaque id、MIME、字节数、时长、SHA-256 和过期时间。
- 不允许本地路径、OPFS 路径、供应商 URL、base64 原文和临时凭据。
- 首期不保存逐字时间轴、说话人分离、置信度和分段数组。

### Music request

```text
kind: audio
operation: text-to-music
providerInstanceId
providerRevision
modelId
prompt
parameters: object
```

`parameters` 必须是目录定义的封闭对象。首期只允许目录实际支持的时长、风格、乐器、情绪和歌词开关，禁止把任意供应商字段透传到客户端。

### Video request

```text
kind: video
operation: text-to-video
providerInstanceId
providerRevision
modelId
prompt
parameters: { ratio, durationSeconds, resolution }
```

视频实际 MIME、字节数、时长、宽度和高度由服务端结果 manifest 与浏览器解码共同确认。请求中的画幅和时长不能覆盖实际结果。

## 4. MediaInputReference

ASR 输入的短期服务端对象引用。

| 字段         | 类型                | 约束                                    |
| ------------ | ------------------- | --------------------------------------- |
| `id`         | UUID                | 服务端生成，客户端只作为 opaque id 使用 |
| `mediaType`  | string              | 必须属于目录允许的音频 MIME             |
| `bytes`      | 正整数              | 服务端根据对象重新计算                  |
| `durationMs` | 正整数              | 服务端解析或验证后的实际时长            |
| `sha256`     | 64 位十六进制字符串 | 服务端重新计算                          |
| `expiresAt`  | ISO timestamp       | 短于任务最长保留期                      |

对象存储 key 使用 `inputs/<id>`。任务完成、失败、放弃、过期或删除时清理。清理失败由任务 alarm 重试，不影响本机已有数据。

## 5. MediaResultManifest

音频或视频二进制结果的真实元数据。它是服务端结果状态的一部分，也是本机保存和下载的唯一元数据来源。

### Audio manifest

| 字段         | 类型                | 约束                       |
| ------------ | ------------------- | -------------------------- |
| `kind`       | `audio`             | 固定                       |
| `mediaType`  | string              | 与实际响应头和文件容器一致 |
| `format`     | string              | 目录允许的格式             |
| `durationMs` | 正整数              | 不使用请求值替代           |
| `sampleRate` | 正整数或 null       | 音频格式无法提供时为 null  |
| `channels`   | 正整数或 null       | 同上                       |
| `bytes`      | 正整数              | 与结果对象大小一致         |
| `sha256`     | 64 位十六进制字符串 | 服务端计算                 |

### Video manifest

| 字段         | 类型                              | 约束                     |
| ------------ | --------------------------------- | ------------------------ |
| `kind`       | `video`                           | 固定                     |
| `mediaType`  | `video/mp4` 或目录允许的安全 MIME | 与实际响应一致           |
| `format`     | string                            | 目录允许的格式           |
| `codec`      | string                            | 服务端结果验证后的 codec |
| `width`      | 正整数                            | 浏览器解码必须一致       |
| `height`     | 正整数                            | 浏览器解码必须一致       |
| `durationMs` | 正整数                            | 浏览器解码必须一致       |
| `bytes`      | 正整数                            | 与结果对象大小一致       |
| `sha256`     | 64 位十六进制字符串               | 服务端计算               |

## 6. TranscriptResult

ASR 的可复制、可下载文本结果。

| 字段               | 类型                | 约束                           |
| ------------------ | ------------------- | ------------------------------ |
| `kind`             | `transcript`        | 固定结果类型                   |
| `text`             | string              | 非空，长度受目录和结果上限约束 |
| `language`         | string              | 用户选择或服务端识别出的语言   |
| `detectedLanguage` | boolean             | 是否由服务端识别               |
| `characters`       | 正整数              | Unicode code point 数量        |
| `sha256`           | 64 位十六进制字符串 | 对规范化文本计算               |

首期不包含逐字时间轴、分段、说话人和置信度，避免在保存、下载和同步中引入第二套时间序列模型。

## 7. CreditReservation and LedgerEntry

积分状态沿用现有 `RelayCredits`。

- `pending`：任务记录已创建，尚未完成原子预占。
- `reserved`：余额已预占，尚未对用户结算。
- `charged`：结果确认后完成一次扣减。
- `released`：明确失败、拒绝或安全放弃后释放预占。

用户可见流水继续使用 `CreditEntry`，以任务 ID 作为 request reference。相同任务 ID和动作只能产生一条有效流水。

## 8. LocalMediaAsset

继续使用 `local_media_asset` 表保存 TTS、音乐和视频二进制。现有字段保持兼容。

- `kind` 仍为 `audio | video`。
- `request` 保存完整的已验证请求快照，其中 operation 区分 TTS、音乐和视频。
- `result` 保存对应的 `MediaResultManifest`，不保存上游 URL。
- `fileId` 指向当前设备存储插件对象。
- `digest` 是本机文件 SHA-256。
- `stage` 使用 `saving | ready | deleting | broken`。
- 音频文件名保持现有 `audio-<jobId>.wav` 兼容格式。目录支持新增格式时，必须先扩展受控扩展名映射并保留旧文件读取。
- 视频文件名保持现有 `video-<jobId>.mp4` 兼容格式。

## 9. LocalTranscript

新增 `local_transcript` 表，专门保存 ASR 文本，不占用 OPFS 文件记录。

| 字段                 | 类型          | 约束                                           |
| -------------------- | ------------- | ---------------------------------------------- |
| `jobId`              | UUID          | 与任务一对一                                   |
| `request`            | string        | JSON 序列化的已验证 ASR 请求，不含原始音频字节 |
| `providerInstanceId` | UUID          | 来源能力实例                                   |
| `modelId`            | string        | 来源模型                                       |
| `language`           | string        | 结果语言                                       |
| `detectedLanguage`   | boolean       | 与结果一致                                     |
| `text`               | string        | 非空文本                                       |
| `digest`             | string        | 文本 SHA-256                                   |
| `bytes`              | 正整数        | UTF-8 字节长度                                 |
| `stage`              | `saving       | ready                                          | deleting | broken` | 与二进制资产使用同一可恢复语义 |
| `createdAt`          | ISO timestamp | 结果创建时间                                   |
| `updatedAt`          | ISO timestamp | 最近一次本机状态变化                           |

索引为 `jobId` 唯一。删除顺序为先推进 `deleting`，再删除记录，最后刷新任务和作品库索引。文本保存失败只重试 RxDB 事务，不重发 ASR。

## 10. LocalGenerationSubmissionJournal

新增通用提交意图模型，解决当前音频和视频 journal 只有一个 pending 且无法表达 ASR 输入的问题。

| 字段             | 类型                  | 约束                     |
| ---------------- | --------------------- | ------------------------ |
| `key`            | UUID                  | 本机提交意图身份         |
| `idempotencyKey` | UUID                  | 与服务端 task id 一致    |
| `kind`           | string                | operation 的输入输出类别 |
| `operation`      | string                | 任务操作                 |
| `request`        | string                | 完整已验证请求快照       |
| `createdAt`      | ISO timestamp         | 创建时间                 |
| `firstSentAt`    | ISO timestamp or null | 首次发送时间，只写入一次 |
| `jobId`          | UUID or null          | 接单后回填               |
| `resultHandled`  | boolean               | 结果是否完成本机处理     |
| `revision`       | 正整数                | 本机并发更新保护         |

旧 `audio-submissions`、`video-submissions` 的版本 1 数据只读迁移到通用模型，不用空日志覆盖损坏记录。任务确认后保留足够信息供刷新续接和重复提交保护，超过服务端保留期后再清理。

## 11. 备份、同步和查询边界

- 现有图片备份版本 1 和版本 2 继续可读，图片文件名和图片同步契约不变。
- 本故事首期不把音频、视频原文件或 Transcript 加入远端图片 Storage、`PublicWorkPayload` 和 `media_sync_records`。
- 作品库查询增加本机 `audio`、`video`、`transcript` 类型投影。它们的删除和恢复在当前设备完成。
- 如果后续需要跨设备同步，必须新增媒体对象存储、RLS、冲突、删除审计和配额契约，不能复用图片同步表的 MIME 和路径假设。
