# 国内平台生图配置

新部署由 `aiao-media:prepare-self-hosted` 在 Git 忽略的 `aiao-media/tmp/self-hosted` 生成部署文件。脚本只在 `platform.env` 不存在时创建停用模型的空配置，保留已有配置并将权限设为 `0600`。部署凭据和持久化目录继续由主 Compose 配置提供。

平台模型单独配置在部署目录的 `platform.env`：

```dotenv
ALLOWED_PROVIDER_BASE_URLS='["https://images.example.test/v1"]'
MEDIA_PLATFORM_MODELS='[{"id":"platform-image","name":"平台图片","baseUrl":"https://images.example.test/v1","model":"image-model","secret":"MEDIA_IMAGE_API_KEY","credits":1,"protocol":"openai","sizes":["1024x1024"],"aspectRatios":["1:1"],"qualities":["low","high"],"counts":[1,2],"supportsImageEditing":false}]'
MEDIA_IMAGE_API_KEY='replace-on-host'
```

`baseUrl` 必须是部署允许列表里的 HTTPS API 前缀，`secret` 指向同一文件中的凭据变量，`credits` 是每个成功结清任务消费的正整数积分。`protocol` 为 `openai` 时可配置 `sizes/aspectRatios/qualities/complexities/counts`；Gemini Interactions 使用 `imageOptions` 声明有效的宽高比、分辨率与交付尺寸组合，并可按型号配置 `thinkingLevels`。`supportsImageEditing` 默认关闭；开启后创作页显示单张 PNG/JPEG 参考图入口。公开模型目录只返回平台标识、名称、积分和经过校验的能力。模型、允许列表或凭据缺失时，接口明确返回未启用，不改用旧生成入口。

Compose 只把这个文件传给 API。主配置显式设置的账号服务凭据、数据目录、公开来源和初始化密钥不会被平台文件覆盖。修改后仅重建 API；保留数据库、Storage、relay 和证书卷。不要将含真实环境变量的 Compose 解析结果写入公共日志。

已有站点升级前，保存当前配置和产物，备份数据库及原图，再核对数据库 marker。`10 → 11 → 13 → 16` 三段增量 SQL 的顺序与保护见[正式验收清单](../../requirements/plans/release-completion-tasks.md#现有生产库的升级顺序)。已有数据的数据库不运行新项目初始化包。

旧部署可能仍使用没有 SMTP 参数的 Auth 配置。升级时保留已核对的账号服务设置，合入 API 的 `env_file` 接线并删除旧的硬编码模型允许列表；不要用新版整份 Compose 覆盖尚未具备 SMTP 配置的旧部署。

配置检查通过 Nx 运行，需要本机可用的 Docker Compose：

```bash
NX_NO_CLOUD=true NX_DAEMON=false pnpm nx run aiao-media:self-hosted-config-test
```

此检查只解析配置，覆盖空平台文件、API 独占凭据和主配置保护，不启动服务或调用上游模型。真实生成、积分和持久任务仍须按两个正式区域分别验收。
