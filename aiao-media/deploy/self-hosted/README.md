# 国内平台生图配置

新部署由 `aiao-media:prepare-self-hosted` 在 Git 忽略的 `aiao-media/tmp/self-hosted` 生成部署文件。部署凭据和持久化目录由主 Compose 配置提供，媒体平台目录由后台保存。

平台模型、ASR、TTS、音乐和视频能力统一在 Admin「媒体平台」页面配置。登录部署后的 `/admin/`，打开侧边栏的「媒体平台」，提交完整的图片模型和媒体能力目录。供应商 HTTPS 地址、上游模型和 API Key 保存在服务端私有配置表，不写入部署文件或本地 `.dev.vars`。
Compose 只把这个文件传给 API。主配置显式设置的账号服务凭据、数据目录、公开来源和初始化密钥不会被平台文件覆盖。修改后仅重建 API；保留数据库、Storage、relay 和证书卷。不要将含真实环境变量的 Compose 解析结果写入公共日志。

已有站点升级前，保存当前配置和产物，备份数据库及原图，再核对数据库 marker。`10 → 11 → 13 → 16` 三段增量 SQL 的顺序与保护见[正式验收清单](../../requirements/plans/release-completion-tasks.md#现有生产库的升级顺序)。已有数据的数据库不运行新项目初始化包。

旧部署可能仍使用没有 SMTP 参数的 Auth 配置。升级时保留已核对的账号服务设置，合入 API 的 `env_file` 接线并删除旧的硬编码模型允许列表；不要用新版整份 Compose 覆盖尚未具备 SMTP 配置的旧部署。

配置检查通过 Nx 运行，需要本机可用的 Docker Compose：

```bash
NX_NO_CLOUD=true NX_DAEMON=false pnpm nx run aiao-media:self-hosted-config-test
```

此检查只解析配置，覆盖空平台文件、API 独占凭据和主配置保护，不启动服务或调用上游模型。真实生成、积分和持久任务仍须按两个正式区域分别验收。
