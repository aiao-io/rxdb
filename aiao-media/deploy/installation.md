# 首次安装

self-hosted 与 Cloudflare 都使用同源 `/admin/` 完成首次设置。未初始化时用户端自动进入此页面；完成后此页面变为管理员登录，不能再次创建首个管理员。

## self-hosted

1. 运行 `aiao-media:prepare-self-hosted` 准备部署文件；脚本生成随机 `MEDIA_SETUP_TOKEN`，保存在忽略的 `aiao-media/tmp/self-hosted/.env`，再次运行保留原值。
2. 运行 `aiao-media:release-check` 和 `aiao-media-api:build-node`。部署完整 `apps/web/dist/browser` 到 Compose 的 `web` 目录，其中包含 `admin/`；保留持久数据目录和 `.env`。应用数据库迁移，包括 `011-installation.sql`。
3. 启动服务，访问站点，输入安装凭据并设置管理员邮箱和至少 12 位密码。本机 Supabase 地址和密钥自动使用部署配置。

## Cloudflare

1. 在 Worker `aiao-media` 的 secret 中设置至少 32 位随机 `MEDIA_SETUP_TOKEN`。不要将它加入 `vars`、构建环境的公开配置或 URL。
2. 使用 `aiao-media:deploy-check` 检查产物，按正式发布流程部署。产物包含 admin 和 Installation SQLite Durable Object；保留现有绑定及迁移顺序。
3. 首次访问进入向导。填写专用 Supabase 项目 URL、publishable/anon Key、secret/service_role Key，设置管理员邮箱和密码。已有完整服务端配置时自动使用，不必重新填写。
4. 新 Supabase 项目在 SQL 编辑器执行向导提供的新项目安装 SQL；已有 Aiao Media 站点只执行增量 `011-installation.sql`，使用原管理员账号与密码。新项目 SQL 带空库保护，不能用于覆盖已有数据库。

账号邮件、注册开放策略和站点 URL 仍由 Supabase 项目维护。向导创建的首个管理员已确认邮箱，其他用户的注册确认方式不随此操作改变。

## 状态与恢复

安装凭据只验证部署者身份，不能当作管理员登录密码。服务端密钥保存在服务器 SQLite 或 Durable Object 存储中，公开接口只返回 URL 和公开 Key；管理员密码仅用于创建/验证账号，不写安装状态。

服务检查失败时可以修正配置后重试。开始创建账号后，使用同一邮箱和服务配置继续；已有账号必须提供原密码。数据库授权和安装完成回执可重复确认；并发提交只接受一次。完成后刷新或重启不会重新开放安装。

不要删除安装数据来重置密码。备份 self-hosted 的安装数据库和应用数据库；Cloudflare 保留 Installation 对象。密码恢复使用既有账号恢复或可信运维流程。

用户端在线读取安装后的公开配置，无需重新构建；浏览器只缓存这些公开值以支持离线启动。后台登录会话只存内存，刷新或过期后重新登录。
