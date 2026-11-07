# Model Gateway — apps/api/src/gateway

统一的模型 API 网关层：把内部 provider 实例与对外协议保真的入口物理隔离，使得"加 / 换 provider 不动调用方"和"协议保真不动 provider"两件事正交。

参考资料：

- 高层规格：[specs/006-model-gateway/spec.md](../../../../specs/006-model-gateway/spec.md)
- 数据模型：[specs/006-model-gateway/data-model.md](../../../../specs/006-model-gateway/data-model.md)
- 接口契约：[specs/006-model-gateway/contracts/](../../../../specs/006-model-gateway/contracts/)
- 不可变 ADR：[docs/adr/2026-05-15-model-gateway-architecture.md](../../../../docs/adr/2026-05-15-model-gateway-architecture.md)

## 1. 架构总览

```
┌────────────────────────────────────────────────────────────────┐
│                    routes/gateway/  (入口层)                   │
│ ┌────────────────┬──────────────────┬────────────────────────┐ │
│ │ openai/        │ anthropic/       │ project-compat/        │ │
│ │  /v1/chat/...  │  /v1/messages    │  /api/ai/model/chat   │ │
│ │  /v1/audio/... │                  │  /api/ai/model/...    │ │
│ │  /v1/models    │                  │                        │ │
│ └────────────────┴──────────────────┴────────────────────────┘ │
│     ↓ 各入口仅做协议序列化 / 反序列化                          │
│ ┌────────────────────────────────────────────────────────────┐ │
│ │  gateway/core/   (内核)                                    │ │
│ │   • request-context  • error-classifier  • timeout-policy  │ │
│ │   • retention        • sse-writer        • trace-header    │ │
│ └────────────────────────────────────────────────────────────┘ │
│     ↓ 内核按统一 ChatRequest / AsrRequest / TtsRequest 调度    │
│ ┌────────────────────────────────────────────────────────────┐ │
│ │  gateway/registry/  (启动期一次性装配)                     │ │
│ │   • config-loader (providers.yaml → ProviderConfig[])      │ │
│ │   • provider-registry (健康探活 / capability 白名单 /      │ │
│ │     isDefault 唯一性 / default 回退)                       │ │
│ │   • model-registry (model id 全局唯一)                     │ │
│ └────────────────────────────────────────────────────────────┘ │
│     ↓ Registry 注入 provider 实例到入口                        │
│ ┌────────────────────────────────────────────────────────────┐ │
│ │  gateway/providers/  (provider 适配器)                     │ │
│ │   ChatProvider | AsrProvider | TtsProvider                 │ │
│ │   • deepseek-chat  • openai-compat-asr  • openai-compat-tts│ │
│ │   • mock-echo / mock-asr / mock-tts (测试)                 │ │
│ └────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────┘
                          ↓ 鉴权（gateway/auth/）
                  ┌────────────────────────┐
                  │  jwt-verifier          │
                  │  auth-middleware       │
                  │  (cookie > Bearer >    │
                  │   x-api-key)           │
                  └────────────────────────┘
```

## 2. 模块职责

| 目录                            | 职责                                                                                        | 关键规约                 |
| ------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------ |
| `core/types.ts`                 | RequestContext / GatewayError / Modality / EntryStyle                                       | data-model §1, §4, §9    |
| `core/errors.ts`                | UpstreamHttpError / TimeoutError / ValidationError / UnauthorizedError / ModelNotFoundError | provider-interfaces §6   |
| `core/request-context.ts`       | 每请求生成 traceId + AbortSignal.any(client, timeout)                                       | FR-040                   |
| `core/error-classifier.ts`      | Error → GatewayError 统一分类                                                               | FR-005                   |
| `core/timeout-policy.ts`        | chat firstByte=30s / idle=60s / asr total=120s / tts total=60s                              | FR-008                   |
| `core/retention.ts`             | /tmp/aiao-gateway 落盘 + 5 分钟 TTL                                                         | FR-043                   |
| `core/sse-writer.ts`            | data: / event: SSE 帧拼装                                                                   | FR-007                   |
| `core/trace-header.ts`          | x-trace-id header 写入                                                                      | FR-040                   |
| `auth/jwt-verifier.ts`          | jose 远程 JWKS + 10 分钟缓存                                                                | FR-054                   |
| `auth/auth-middleware.ts`       | 三通道 cookie > Bearer > x-api-key 提取 + 校验                                              | FR-054                   |
| `registry/config-loader.ts`     | 读 providers.yaml + env 插值                                                                | FR-002                   |
| `registry/provider-registry.ts` | 启动期装配 + capability 白名单 + default 唯一性 + 健康探活                                  | FR-002 / FR-003 / FR-004 |
| `registry/model-registry.ts`    | model id 全局唯一性，skipped provider 自动剔除                                              | FR-056                   |
| `providers/types.ts`            | ChatProvider / AsrProvider / TtsProvider 三个公开契约                                       | provider-interfaces      |
| `providers/*.provider.ts`       | 具体 provider 适配器，仅实现一个接口                                                        | FR-042                   |
| `providers/*.factory.ts`        | factory 注册到 bootstrap DEFAULT_FACTORIES                                                  | FR-042                   |

## 3. 新增一个 provider 的步骤（FR-042）

详见 [contracts/provider-interfaces.md §5](../../../../specs/006-model-gateway/contracts/provider-interfaces.md#5-provider-实现约定fr-042-自助接入步骤)。简化清单：

1. **写 provider 实现** `apps/api/src/gateway/providers/<name>.provider.ts`：实现 `ChatProvider` / `AsrProvider` / `TtsProvider` 之一。
2. **写 factory** `apps/api/src/gateway/providers/<name>.factory.ts`：

   ```ts
   import type { ProviderConfig } from '../../config';
   import type { ProviderFactory } from '../registry/provider-registry';
   import { MyProvider } from './my-provider.provider';

   export const myProviderFactory: ProviderFactory = {
     id: 'my-provider',
     modality: 'chat',
     build: (config: ProviderConfig) => new MyProvider(config)
   };
   export default myProviderFactory;
   ```

3. **加入 bootstrap** `apps/api/src/bootstrap.ts` 的 `DEFAULT_FACTORIES` 数组追加引用。
4. **配置 providers.yaml** `apps/api/config/providers.yaml` 追加：

   ```yaml
   - id: my-provider
     modality: chat
     modelIds: [my-cool-model-v1]
     baseUrl: '${env:MY_PROVIDER_BASE_URL}'
     apiKey: '${env:MY_PROVIDER_API_KEY}'
     capabilities: [stream]
   ```

5. **单测 + 集成测试**（可选但强推）：参考 `tests/contract/openai-sdk.contract.test.ts` 与 `tests/unit/provider-registry.test.ts` 写注入 + 健康探活 + 模态命中。
6. **零改动验证**：不需要改任何 `routes/gateway/openai/*` / `routes/gateway/anthropic/*` / `routes/gateway/project-compat/*` 或 dashboard 代码。

## 4. capability 白名单（FR-002）

合法 capability 取值穷尽集合：

| capability        | 含义                                            | 谁需要                   |
| ----------------- | ----------------------------------------------- | ------------------------ |
| `stream`          | 支持 token 级 SSE 流（OpenAI / Anthropic 风格） | chat provider 默认应声明 |
| `reference_voice` | TTS 支持参考声纹 multipart 上传                 | tts provider 选择性声明  |
| `timestamps`      | ASR 支持 verbose_json 含 segments 时间戳        | asr provider 选择性声明  |

启动期校验：声明非白名单 capability 直接 `process.exit(1)`；空数组或未声明 = baseline 能力（最低公共子集）。

## 5. 已实现 / 未实现功能字段对照（FR-055）

各入口的请求字段透传 / 拒绝策略：

### 5.1 OpenAI `/v1/chat/completions`

| 字段                                                                                                                                         | 状态                       |
| -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `model` / `messages` / `stream` / `stream_options.include_usage` / `temperature` / `top_p` / `max_tokens` / `max_completion_tokens` / `stop` | ✅ 透传                    |
| `logprobs` / `seed` / `tools` / `parallel_tool_calls` / `response_format: {type: 'json_schema'}`                                             | ❌ 422 `unsupported_field` |
| 其他字段                                                                                                                                     | 静默忽略（SDK 演进兼容）   |

### 5.2 Anthropic `/v1/messages`

| 字段                                                                                                                           | 状态                       |
| ------------------------------------------------------------------------------------------------------------------------------ | -------------------------- |
| `model` / `messages` / `system` (string \| TextBlock[]) / `max_tokens` / `temperature` / `top_p` / `stop_sequences` / `stream` | ✅ 透传                    |
| `tools` / `tool_choice`                                                                                                        | ❌ 422 `unsupported_field` |
| `messages[].content[].type === 'image' \| 'tool_use' \| 'tool_result'`                                                         | ❌ 422 `unsupported_field` |
| `system[].cache_control`                                                                                                       | ❌ 422 `unsupported_field` |
| `anthropic-version` header                                                                                                     | ✅ 接受任意值（不强校验）  |

### 5.3 OpenAI `/v1/audio/transcriptions`

| 字段                                                                         | 状态                                      |
| ---------------------------------------------------------------------------- | ----------------------------------------- |
| `file` / `model` / `language` / `prompt` / `response_format` / `temperature` | ✅ 透传                                   |
| `timestamp_granularities[]`                                                  | ⚠️ 透传到 provider，provider 自决是否处理 |
| 文件 > 25 MB                                                                 | ❌ 422 `audio_too_large`                  |

响应：`{ text }` 或 `verbose_json` `{ text, segments, language, duration }`。
**FR-021**：`provider` / `model_id` **不**入 JSON body，通过 `x-aiao-provider` / `x-aiao-model` header 暴露。

### 5.4 OpenAI `/v1/audio/speech`

| 字段                                                                          | 状态                                      |
| ----------------------------------------------------------------------------- | ----------------------------------------- |
| `model` / `input` / `voice` / `response_format` (mp3/wav/opus/flac) / `speed` | ✅ 透传                                   |
| `voice_reference` (multipart)                                                 | ✅ provider 声明 `reference_voice` 才能用 |
| `input.length > 4096`                                                         | ❌ 422 `text_too_long`                    |

## 6. 错误分类映射（FR-005）

详见 `core/error-classifier.ts` 与 `contracts/provider-interfaces.md §6`。三套入口序列化器从同一 `GatewayError` 映射到不同响应体：

| 入口             | 错误体形式                                                   |
| ---------------- | ------------------------------------------------------------ |
| `openai-v1`      | `{ error: { message, type, code, param } }`                  |
| `anthropic-v1`   | `{ type: 'error', error: { type, message } }`                |
| `project-compat` | `{ type, message, status }` (与 dashboard `AiApiError` 对齐) |

## 7. 鉴权（FR-054）

三通道按优先级：

1. **Cookie** `access_token=<jwt>`（dashboard BFF 写入）
2. **Authorization** `Bearer <jwt>`（SDK / 服务端调用）
3. **x-api-key** `<jwt>`（OpenAI SDK 兼容路径）

任一命中即使用其 token；Supabase JWKS 远程获取后 10 分钟缓存；校验 `aud` / `iss` / `exp`。失败抛 `UnauthorizedError`。

## 8. 启动日志格式

```
[gateway] provider=<id> modality=<m> status=enabled
[gateway] provider=<id> modality=<m> status=skipped reason="<msg>"
[gateway] no explicit default for modality=<m>, falling back to first enabled provider=<id>   (WARN)
```

非零退出仅在：capability 非白名单 / isDefault 多于 1 / factory 配对不匹配 / model id 冲突。运行期上游失败按 FR-005 透传。

## 9. 排障流程

> 案例数据库见 [quickstart §8](../../../../specs/006-model-gateway/quickstart.md#8-排障)。
> 本节给出"从症状到根因"的决策树，案例细节回查 §8 对应小节即可。

### 9.1 决策树

```
拿到客户端错误 / 异常
    │
    ├─ 先从响应取 x-trace-id（流式响应：在第一个 SSE chunk 到达前的 header；
    │   非流式响应：HTTP response header）
    │
    ├─ apps/api stdout/stderr 中 grep <trace-id>
    │     ├─ 命中：阅读 [gateway] error trace=... type=... 行
    │     │       → 跳到 9.2 按 type 处理
    │     └─ 未命中：请求未到内核（network / proxy / cors / cookie 不通）
    │                → 跳到 9.3
    │
    └─ 持续无 trace_id 命中 → 跳到 9.4（启动期问题）
```

### 9.2 按错误 type 路由

| `GatewayError.type` | 客户端 HTTP        | 排查入口                           | 关键 grep                          |
| ------------------- | ------------------ | ---------------------------------- | ---------------------------------- |
| `unauthorized`      | 401                | quickstart §8.1                    | `jwt verify failed` / `jwks fetch` |
| `validation`        | 422                | quickstart §8.3 + 本 README §5     | `unsupported_field`                |
| `not_found`         | 404                | quickstart §8.2 + `GET /v1/models` | `status=skipped`                   |
| `rate_limit`        | 429                | quickstart §8.6                    | `upstream_code=429`                |
| `timeout`           | 504 / SSE 内 error | quickstart §8.5                    | `firstByteSignal` / `idleSignal`   |
| `server`            | 502 / SSE 内 error | quickstart §8.6                    | `upstream_code=5xx`                |

### 9.3 trace_id 找不到的情况

请求未进入内核。从外到内逐层排查：

1. **CORS / 浏览器层**：dashboard 看 devtools network；非 dashboard 调用看 `@elysiajs/cors` 配置；OPTIONS preflight 必须 200
2. **Cookie / Authorization 通道**：调用方是否带凭证？`fetch` 是否 `credentials: 'include'`？BFF 是否写入了 `access_token` cookie？
3. **路径错位**：openai SDK 的 `baseURL` 必须是 `<gateway>/v1`（含 `/v1`）；anthropic SDK 是 `<gateway>`（**不**含 `/v1`，SDK 自动拼）；项目兼容路径是 `<gateway>/api/ai/...`
4. **反代 / nginx**：检查是否在 nginx 层就 reject 了（如 body 太大、超时太短）

### 9.4 启动期 / 配置类问题（进程一启就退）

非零退出退出码 1 必修。常见根因见 quickstart §8.8。修后必须重启 `nx serve api` 才生效。

### 9.5 流式响应的特殊取证

- **OpenAI 流**：上游中断后会有一帧 `data: {"error":...}`，**不**再 `[DONE]`。客户端 SDK 接到 APIError；server 日志同时写 error 行
- **Anthropic 流**：`event: error\ndata: {...}`，**不**再 `message_stop`。`@anthropic-ai/sdk` 通过 stream 错误事件回调暴露
- **project-compat 流**：在 AI SDK data stream 末尾追加 `3:{type,message,status}\n`。dashboard `AiApiService` 已识别

### 9.6 retention 临时文件类问题（FR-043）

```bash
ls -la /tmp/aiao-gateway/
# 期望：dr-x------ owner=apps/api 用户
# 任一 .wav / .mp3 文件应在 5min 内消失（TTL）
```

| 症状                                     | 原因                                        | 处理                                                 |
| ---------------------------------------- | ------------------------------------------- | ---------------------------------------------------- |
| 上传 ASR 立即 500                        | `/tmp/aiao-gateway/` 不可写                 | 检查目录权限 / 磁盘满                                |
| TTS reference voice 报 `file_not_found`  | retention TTL 在 provider 调用前到期        | 检查 ASR/TTS 整体耗时是否超过 5min（不应该）         |
| 进程异常退出后 `/tmp/aiao-gateway/` 堆积 | `startupSweep` 未运行（bootstrap 启动失败） | 重启进程；retention 会在启动期一次性清扫所有过期文件 |

### 9.7 开发期 mock 注入（仅 NODE_ENV ≠ production）

`mock-echo` provider 支持基于首条 user message `content` 的行为注入 marker，用于本地复现错误路径：

| marker              | 触发                     | 用途                      |
| ------------------- | ------------------------ | ------------------------- |
| `inject-5xx`        | `UpstreamHttpError(500)` | 验证 server 错误透传      |
| `inject-rate-limit` | `UpstreamHttpError(429)` | 验证 rate_limit_error     |
| `inject-timeout`    | `TimeoutError`           | 验证 504 / SSE 内 timeout |
| `inject-validation` | `ValidationError`        | 验证 422 字段拒绝         |

```bash
curl http://localhost:3200/v1/chat/completions \
    -H "authorization: Bearer $JWT" \
    -H 'content-type: application/json' \
    -d '{"model":"mock-echo-1","messages":[{"role":"user","content":"inject-rate-limit"}]}'
# 期望：429 + body.error.type == "rate_limit_error"
```

### 9.8 常用 one-liner

```bash
# 看启动期 registry 装配结果
nx serve api 2>&1 | grep '^\[gateway\]'

# 看所有 enabled model id
curl -s http://localhost:3200/v1/models -H "authorization: Bearer $JWT" | jq '.data[].id'

# 看 OpenAPI 文档完整性（FR-041）
curl -s http://localhost:3200/openapi/json | jq '.paths | keys'

# 看某条 trace_id 的完整故事
TRACE_ID=...
nx serve api 2>&1 | grep "$TRACE_ID"
```
