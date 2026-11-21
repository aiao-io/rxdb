# MEDIA-US-111 Quickstart 验收指南

本指南用于实现完成后的本地、fixture、Supabase 和正式 provider 验收。命令全部通过 Nx 运行。正式 provider 路径可能产生真实积分，必须按产品验收凭据和运行锁执行。

## 前置条件

- Node、pnpm 和仓库依赖已安装。
- 当前工作区为 `/Users/jimmy/Documents/aiao/rxdb-2`。
- 本地 fixture 使用固定端口，不能与另一个检出目录并行启动。
- ASR fixture 准备一段目录允许的音频，TTS、音乐和视频 fixture 准备对应的最小结果样本。
- 本地 Supabase 和 Cloudflare 依赖按 `aiao-media` 的现有脚本启动。
- 正式 provider 验收的账号、模型、发布版本和 manifest 必须来自评审记录，不写入仓库。

## 1. 需求与契约门禁

```bash
pnpm nx run aiao-media:requirements-check --output-style=static
pnpm nx run api-contracts:test
pnpm nx run api-contracts:typecheck
pnpm nx run api-contracts:lint
pnpm nx run domain:test
pnpm nx run domain:typecheck
```

预期结果是需求检查通过，新增的 capability、generation、ASR input、Transcript、result manifest 和敏感字段校验全部通过。`packages/domain` 只有在实现确实修改共享领域类型时才增加对应 lint 或 coverage 任务。

## 2. API 任务与积分验证

```bash
pnpm nx run aiao-media-api:test
pnpm nx run aiao-media-api:script-test
pnpm nx run aiao-media-api:relay-test
pnpm nx run aiao-media-api:platform-relay-test
pnpm nx run aiao-media-api:typecheck
pnpm nx run aiao-media-api:lint
pnpm nx run aiao-media-api:relay-coverage
```

至少验证以下场景。

- 四类能力目录只返回公开字段。
- 未登录、余额不足、能力停用和参数非法不会调用上游。
- 双击、双标签页和同任务重试只产生一个上游调用和一笔有效结算。
- ASR 输入对象校验所有权、MIME、字节数、时长和 SHA-256。
- 明确拒绝、超时、5xx、空结果和无法验证结果分别映射到失败或待核查。
- 待核查任务不自动重发，alarm 能释放或继续等待核查。
- 输入和结果对象在完成、失败、删除和过期后清理。
- 日志、任务快照、队列、备份和同步中不出现 session、Key、临时路径或供应商 URL。
- provider URL 只允许同源 HTTPS 下载，重定向被拒绝，authorization 只存在于单次服务端下载过程。
- 音频和视频分别拒绝超出能力目录 `maxBytes` 或 `maxDurationMs` 的真实结果。
- 缺少真实视频尺寸、时长或 codec 时任务失败或进入待核查，不使用请求参数伪造 manifest。

## 3. Angular 和本机存储验证

```bash
pnpm nx run aiao-media:test
pnpm nx run aiao-media:test-browser
pnpm nx run aiao-media:typecheck
pnpm nx run aiao-media:lint
```

本机浏览器测试必须覆盖真实 RxDB、wa-sqlite、IndexedDB 和 OPFS。

- TTS 和音乐保存真实音频 MIME、字节数、时长、摘要和 operation。
- 视频保存并校验真实 MIME、字节数、尺寸和时长。
- ASR 保存语言、自动识别标记、文本摘要和文本下载。
- `saving`、`ready`、`deleting`、`broken` 状态在关闭、重开和损坏恢复后保持一致。
- 保存失败重试只写本机，不调用上游和不产生积分流水。
- 删除中断恢复后文件、RxDB 记录和作品库索引最终一致。
- 现有图片路由、图片备份、图片同步和图片任务恢复回归通过。

## 4. Fixture 产品 E2E

实现阶段新增 `aiao-media-e2e:multimodal-e2e` target，并使用独立配置和 fixture。实现完成后执行。

```bash
pnpm nx run aiao-media:offline-assets
pnpm nx run aiao-media-e2e:provider-acceptance-check
pnpm nx run aiao-media-e2e:provider-acceptance-fixture
pnpm nx run aiao-media-e2e:multimodal-e2e
```

fixture 至少包含四组独立测试。

1. TTS 提交、播放、下载、保存、刷新和积分结算。
2. ASR 上传、识别、复制、文本下载、保存、刷新和失败状态。
3. 音乐生成、播放、下载、保存、结果待核查和积分释放。
4. 视频生成、刷新续接、播放、实际尺寸和时长校验、保存失败重试。

每组都要记录上游调用计数，断言本机保存重试不创建新任务。

## 5. 本地 Supabase 产品验收

```bash
pnpm nx run aiao-media:supabase-init
pnpm nx run aiao-media:supabase-migrate
pnpm nx run aiao-media:credits-local-test
pnpm nx run aiao-media:product-test
pnpm nx run aiao-media-e2e:product-e2e
pnpm nx run aiao-media:backend-rxdb-local-test
```

该层证明本地 Auth、RLS、积分、任务 API 和本机交付可以组合工作。受控 provider fixture 不能关闭正式供应商验收。

## 6. 正式 provider 验收

实现阶段新增四类能力独立的正式验收脚本和 Nx target。每类至少记录一条成功路径和一条失败路径，包含任务 ID、清洗后的 provider request id、实际 MIME、字节数、时长或画幅、积分流水和本机保存结果。

```bash
AIAO_MEDIA_ACCEPTANCE_GENERATE=1 \
AIAO_MEDIA_ACCEPTANCE_ORIGIN='<reviewed-origin>' \
AIAO_MEDIA_ACCEPTANCE_RELEASE='<reviewed-release>' \
AIAO_MEDIA_ACCEPTANCE_MANIFEST_SHA256='<reviewed-manifest>' \
AIAO_MEDIA_ACCEPTANCE_EMAIL='<private-account-email>' \
AIAO_MEDIA_ACCEPTANCE_PASSWORD='<private-account-password>' \
pnpm nx run aiao-media-e2e:multimodal-provider-acceptance
```

TTS、ASR、音乐和视频应在正式验收报告中分开列出。任何未知回执都停止该能力的重跑，并保留原任务供人工核查。

## 7. 发布前检查

```bash
pnpm nx run aiao-media:release-check
pnpm nx run aiao-media:deploy-check
pnpm nx run aiao-media-api:deploy-check
pnpm nx run aiao-media-e2e:public-origin-smoke
```

发布扫描应确认以下内容。

- 客户端 bundle 不含服务端 Key、供应商 API Key、session、relay token 或 `.env` 内容。
- OpenAPI 文档包含多模态目录、输入和任务结果契约。
- 图片旧 `/api/models`、四条既有路由和图片备份行为没有破坏性变化。
- 关键本机操作保持数据库操作小于 100 ms 的预算，Web 首屏保持小于 1.5 s。媒体生成总耗时由 provider 负责，任务接单和状态更新单独测量。
- `api-contracts` 的 gzip 增量保持在 50 KB 以内，新增 API 和 UI 继续可 tree-shake。

## 证据层级

`requirements-check`、单元测试、fixture E2E 和本地 Supabase 只能证明各自层级。它们不能替代四类能力的正式 provider 调用。正式验收未完成前，`MEDIA-US-111` 不能标记为完成。
