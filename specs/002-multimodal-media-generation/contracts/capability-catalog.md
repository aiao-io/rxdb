# 能力目录契约

## Endpoint

`GET /api/media/capabilities`

响应必须使用 `cache-control: no-store`，只返回当前平台启用且通过服务端策略筛选的能力。

```json
{
  "capabilities": [
    {
      "providerInstanceId": "00000000-0000-4000-8000-000000000001",
      "providerRevision": 3,
      "kind": "audio",
      "operation": "text-to-speech",
      "label": "平台配音",
      "modelId": "tts-standard",
      "credits": 2,
      "input": {
        "textMaxLength": 500
      },
      "parameters": {
        "languages": ["zh-CN", "en-US"],
        "voices": [{ "id": "voice-a", "label": "女声" }],
        "speeds": [0.8, 1, 1.2]
      },
      "output": {
        "mediaTypes": ["audio/wav"],
        "maxBytes": 8388608,
        "maxDurationMs": 120000
      }
    }
  ],
  "revision": 12
}
```

示例中的能力项仅说明字段形状。实际模型、成本和参数由服务端环境配置决定。

## Supported operations

| `kind`  | `operation`      | 输入                             | 输出            |
| ------- | ---------------- | -------------------------------- | --------------- |
| `audio` | `text-to-speech` | 文本、语言、声音、语速           | 音频二进制      |
| `audio` | `speech-to-text` | 短期音频输入引用、语言或自动识别 | Transcript JSON |
| `audio` | `text-to-music`  | 音乐提示词和目录参数             | 音频二进制      |
| `video` | `text-to-video`  | 视频提示词和目录参数             | 视频二进制      |

图片能力仍通过 `GET /api/models` 暴露，避免改变已有图片消费者的返回结构。

## Validation rules

- `providerInstanceId`、`providerRevision`、`modelId` 和 `operation` 必须组成唯一目录键。
- `credits` 必须是正整数。
- 所有长度、MIME、字节、时长、宽高、语言、声音和参数枚举都必须在服务端重校验。
- 客户端只显示目录声明的选项，不允许把任意字段透传给 provider adapter。
- 目录响应必须拒绝未知私密字段，发布前扫描不得出现 `baseUrl`、上游模型名、密钥引用或令牌。
- 目录刷新不能覆盖正在运行的任务。任务保存创建时的 `providerInstanceId` 和 `providerRevision`。

## Configuration boundary

建议新增 `MEDIA_PLATFORM_CAPABILITIES` 环境配置。该配置只在 Worker 内解析，私有字段包含 provider protocol、上游地址、上游模型和密钥引用。现有 `MEDIA_PLATFORM_MODELS` 及 `/api/models` 图片配置继续工作。
