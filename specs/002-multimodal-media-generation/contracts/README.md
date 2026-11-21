# MEDIA-US-111 Contracts

这些契约描述实现阶段需要稳定的客户端、Worker、Durable Object 和本机存储边界。具体 TypeScript 类型统一进入 `@aiao-media/api-contracts`，文档中的字段名必须与代码一致。

- [能力目录](./capability-catalog.md)
- [媒体任务](./media-generation-task.md)
- [ASR 输入与 Transcript](./asr-input-transcript.md)
- [媒体结果交付](./media-result-delivery.md)
- [积分预占与结算](./credits.md)
- [本机保存与删除](./local-delivery.md)

公共契约不得出现供应商 URL、上游模型名、密钥名称、访问令牌、本地路径、OPFS 路径或原始输入字节。图片现有 `/api/models` 和图片 relay 请求保持兼容，多模态能力使用新增目录字段和通用任务适配器。
