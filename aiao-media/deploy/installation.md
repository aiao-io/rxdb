# 首次安装

self-hosted 与 Cloudflare 都使用同源 `/admin/` 完成首次设置。未初始化时用户端自动进入此页面；完成后此页面变为管理员登录，不能再次创建首个管理员。

## self-hosted

1. 运行 `aiao-media:prepare-self-hosted` 准备部署文件；部署密钥保存在忽略的 `aiao-media/tmp/self-hosted/.env`，再次运行保留原值。
2. 运行 `aiao-media:release-check` 和 `aiao-media-api:build-node`。部署完整 `apps/web/dist/browser` 到 Compose 的 `web` 目录，其中包含 `admin/`；保留持久数据目录和 `.env`。应用数据库迁移，包括 `011-installation.sql`。
3. 启动服务，访问站点，直接设置管理员邮箱和至少 12 位密码。本机 Supabase 地址和密钥自动使用部署配置。

## Cloudflare

1. 使用 `aiao-media:deploy-check` 检查产物，按正式发布流程部署。产物包含 admin 和 Installation SQLite Durable Object；保留现有绑定及迁移顺序。
2. 首次访问直接进入向导。填写专用 Supabase 项目 URL、publishable/anon Key、secret/service_role Key，设置管理员邮箱和密码。已有完整服务端配置时自动使用，不必重新填写。
3. 新 Supabase 项目在 SQL 编辑器执行向导提供的新项目安装 SQL；已有 Aiao Media 站点只执行增量 `011-installation.sql`，使用原管理员账号与密码。新项目 SQL 带空库保护，不能用于覆盖已有数据库。

账号邮件、注册开放策略和站点 URL 仍由 Supabase 项目维护。向导创建的首个管理员已确认邮箱，其他用户的注册确认方式不随此操作改变。

## 状态与恢复

首次初始化无需额外安装凭据。服务端密钥保存在服务器 SQLite 或 Durable Object 存储中，公开接口只返回 URL 和公开 Key；管理员密码仅用于创建/验证账号，不写安装状态。

服务检查失败时可以修正配置后重试。开始创建账号后，保留原服务配置，管理员邮箱可以修改；账号尚未创建时使用填写的邮箱和密码新建，已经创建的账号验证原密码。失败记录不锁定邮箱。数据库授权和安装完成回执可重复确认；并发提交只接受一次。完成后刷新或重启不会重新开放安装。

已有管理员时，先验证原账号与管理员权限，不创建额外账号。邮箱已存在时继续验证原密码；密码不正确会明确提示，可以修正后重试，不会覆盖密码。

不要删除安装数据来重置密码。备份 self-hosted 的安装数据库和应用数据库；Cloudflare 保留 Installation 对象。密码恢复使用既有账号恢复或可信运维流程。

用户端在线读取安装后的公开配置，无需重新构建；浏览器只缓存这些公开值以支持离线启动。后台登录会话只存内存，刷新或过期后重新登录。
