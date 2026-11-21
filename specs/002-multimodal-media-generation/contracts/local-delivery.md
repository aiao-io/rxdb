# 本机保存与删除契约

## Existing binary assets

TTS、音乐和视频继续使用 `LocalMediaStore` 的音视频资产入口。

- RxDB 表：`local_media_asset`
- OPFS 文件名：`audio-<jobId>.<format>` 或 `video-<jobId>.<format>`
- 阶段：`saving | ready | deleting | broken`
- 唯一键：`kind + jobId`
- 元数据来源：已验证的 `MediaResultManifest`
- 文件摘要：本机计算的 SHA-256

已有图片 `LocalImageWork`、图片文件名、数据库名和 OPFS 根目录不变。

## Transcript assets

新增 `LocalTranscript`。

- RxDB 表：`local_transcript`
- 唯一键：`jobId`
- 字段包含 request、model、language、detectedLanguage、text、digest、bytes、stage、createdAt 和 updatedAt
- 文本以 UTF-8 语义保存，不创建虚假的音频文件或 MIME
- 保存失败只重试 RxDB 事务，删除失败继续保留 `deleting` 状态供恢复

## Submission journal

新增通用 `LocalGenerationSubmissionJournal`。旧版本 `audio-submissions` 和 `video-submissions` 必须保持可读取，并在升级时迁移到通用结构。

提交前顺序如下。

1. 校验目录参数和输入引用。
2. 写入任务 ID、请求快照、幂等身份和 `firstSentAt`。
3. 回读并确认 journal 已持久化。
4. 只有持久化成功后才调用 API。
5. 接单后更新任务状态和 relay ticket。
6. 结果处理和本机保存与任务提交分离。

journal 损坏、版本未知或并发 revision 冲突时停止提交并提示恢复，不创建空日志覆盖旧数据。

## Library projection

作品库增加 `audio`、`video` 和 `transcript` 投影。

- 音频卡片支持试听、下载和删除。
- 视频卡片支持首帧预览、播放、下载和删除。
- Transcript 卡片支持复制、下载和删除。
- 任务状态、保存状态和失败原因可见。
- `LocalCollectionRecord` 的 task payload 使用通用媒体任务 validator。图片同步投影继续只接受图片工作记录。

## Backup and sync

首期不修改图片备份 v1/v2，不把音视频原文件接入图片远端同步。任何未来的媒体备份必须新增版本并保留旧版本导入路径。平台凭据、session、relay token、输入对象 key 和供应商私密字段不得进入备份、同步或构建物。
