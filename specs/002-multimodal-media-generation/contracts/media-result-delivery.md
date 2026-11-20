# 媒体结果交付契约

## Result manifest

音频和视频任务完成时，任务状态携带 `MediaResultManifest`。它来自服务端实际结果，不从请求参数复制。

音频至少包含 `kind`、`mediaType`、`format`、`durationMs`、`bytes` 和 `sha256`。格式支持采样率和声道信息时同时返回 `sampleRate` 和 `channels`。

视频至少包含 `kind`、`mediaType`、`format`、`codec`、`width`、`height`、`durationMs`、`bytes` 和 `sha256`。

## Result endpoint

`GET /api/relay/tasks/{taskId}/result`

| 结果       | Content-Type             | 读取方式                                             |
| ---------- | ------------------------ | ---------------------------------------------------- |
| ASR        | `application/json`       | 校验 TranscriptResult                                |
| TTS 或音乐 | manifest 的实际音频 MIME | 读取 Blob 并校验容器、大小、摘要和时长               |
| 视频       | manifest 的实际视频 MIME | 读取 Blob，校验 MP4 容器并用浏览器解码校验尺寸和时长 |

结果对象放在私有 `results/<taskId>`。响应不得包含供应商 URL。服务端和客户端都不得依据请求的格式、时长或画幅替换 manifest。

## Local save

1. 任务回执通过共享 validator 校验。
2. 结果对象读取并校验真实 MIME、字节数、SHA-256 和适用容器元数据。
3. UI 先显示可预览结果，确认用户保存后调用本机保存方法。
4. 本机写入先落 `saving` 记录，写入 OPFS 后回读验证，最后推进 `ready`。
5. 保存失败保留结果和 `saving` 或 `broken` 记录，重试只执行本机写入。
6. 本机保存成功后调用 `confirm` 完成积分结算，再删除服务端结果对象。

如果结果读取、解码或 manifest 校验失败，客户端调用 `discard` 释放预占。结算或删除响应不确定时保留票据和任务，禁止再次生成。

## Delete local result

音频和视频使用现有 `deleting` 阶段。删除顺序必须是标记删除、删除存储对象、删除 OPFS 文件、删除 RxDB 记录、释放预览 URL。中途重启时恢复逻辑继续同一顺序。

Transcript 没有 OPFS 文件，但仍使用 `saving`、`ready`、`deleting` 和 `broken` 状态保证 RxDB 事务和作品库索引一致。

## Download

下载文件名由任务 ID、operation 和 manifest 的实际格式生成。下载 MIME 使用 manifest 的 `mediaType`。禁止使用请求中的格式、时长、画幅或供应商返回 URL生成下载。
