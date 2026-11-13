# 平台服务配置与运维

2026-11-06 按 [D-17](../../requirements/decisions.md#d-17当前平台免费暂缓独立平台图片服务与计费)，当前平台免费，创作页“平台图片服务”、后台“平台生图与计费”和 `/api/platform/` 对外 API 已移除。独立平台生图、积分购买、支付通知及计费运维暂缓；保留历史后端实现、Durable Object 类/迁移和存量任务、订单、流水及原图，不做数据删除。未来收费需求明确后重新评审，不能仅补齐旧配置恢复入口。

默认免费供应商、本站代理 `/api/relay` 与 `/api/relay/tasks`、平台账号及私有原图同步继续独立运行。下文平台生图与支付配置、结算和恢复条款为历史设计记录，不是当前部署的启用清单。

应用 API 位于 `../api/src`。BYOK 代理（旧版页面使用的无状态 `/api/relay`，以及当前页面使用的 `/api/relay/tasks` 任务）与平台生图分别运行；前者只在本次接单时使用用户 Key，后者只使用服务端模型 Key。代理任务的 `RELAY_TASKS` 与 `RELAY_RESULTS` 配置见[部署说明](local-first-pages.md#正式发布)。平台任务中只保存模型配置标识，不保存 Key、会话或客户端凭据。

## 账号同步配置与历史平台配置

1. 独立 Supabase 产品项目：由所有者审阅 `pnpm nx run aiao-media:production-bundle` 的 SQL，再在空项目初始化。已有产品项目逐个审阅前向迁移，禁止重复运行空库初始化包。初始化包只写私有 bucket 行和 `storage.objects` 策略，不在 `storage` schema 建表或改表（托管项目自带 Storage 表，自 2025-04-21 起不允许用户建表）；本地 Compose 没有 Storage 服务，其替身只在 `001-local-storage-standin.sql`，不进初始化包。
2. Worker secrets：`MEDIA_SUPABASE_URL`、`MEDIA_SUPABASE_ANON_KEY`、`MEDIA_SUPABASE_SERVICE_ROLE_KEY`。浏览器构建的 `AIAO_SUPABASE_URL` 和 `AIAO_SUPABASE_ANON_KEY` 必须指向同一平台项目，公开配置只包含 URL 和 publishable/anon Key；生产启用必须显式构建和审查。
3. 历史平台生图配置（暂缓）：Wrangler 的 `MEDIA_PLATFORM` Durable Object 绑定与 `media-platform-v1` SQLite migration 已配置。平台生图结果需要额外配置私有 R2 bucket 的 `MEDIA_RESULTS` 绑定，禁止公开 bucket 读权限。用户作品原图同步使用统一 Supabase 项目的私有 `aiao-media-images` Storage bucket，与平台生图结果和 `RELAY_RESULTS` 临时中转分开。
4. 历史平台生图配置（暂缓）：`MEDIA_PLATFORM_MODELS` 为 JSON 数组，每项含 `id`、`name`、HTTPS `baseUrl`、上游 `model`、凭据环境变量名 `secret`、单张 `credits` 和单张预算 `costMicros`。上游路径固定，拒绝 IP、非 HTTPS、端口、凭据和重定向。模型原图使用 base64，不能以临时 URL 作为持久结果。
5. 历史平台生图配置（暂缓）：每个 `secret` 对应单独 Worker secret。设置 `MEDIA_PLATFORM_FREE_DAILY` 与 `MEDIA_PLATFORM_DAILY_BUDGET_MICROS`；缺省均零，禁止意外开放免费模型。`costMicros` 是运营配置的成本上界，预算统计包含预占和已结算，不能冒充供应商账单。
6. 历史支付配置（暂缓，对外 webhook 已关闭）：Stripe secrets：`MEDIA_STRIPE_SECRET_KEY`、`MEDIA_STRIPE_WEBHOOK_SECRET`。配置 `MEDIA_CREDIT_PACK`，如 `{"credits":20,"amount":500,"currency":"usd"}`；随后管理员可发布新价格，旧订单价格不变。通知入口为 `/api/platform/webhook`，订阅 Checkout 完成、异步支付成功和 refund.created/refund.updated。
7. 配置平台 Supabase Auth 的站点 URL、允许的登录回调与注册确认邮件。用户注册的是应用平台账号；无需 Supabase 管理账号、Management OAuth、项目 URL、项目 Key 或执行 SQL。启用邮箱确认的项目须在邮件验证后登录，注册响应没有 session 时不能提前开始同步。

## 账号与跨设备同步

部署方一次初始化统一产品项目，并在后续发布中审阅前向迁移。用户在应用内注册、确认邮箱并登录后，即可开启草稿、供应商公开配置、作品信息和原图的跨设备同步。首次上传仍需确认本机范围；API Key、本机路径和文件句柄不上传，原图范围单独确认。

结构化数据继续使用 `rxdb-adapter-supabase`、history 与 sync 插件；原图通过 Supabase Storage 上传、下载并校验 SHA-256。每个账号的工作区由 `media_ensure_workspace` 建立，表与私有 Storage 的 RLS 使用 `auth.uid()` 和工作区归属隔离用户。上线前验证两个普通账号之间无法读取、修改或下载对方数据；管理员权限不替代用户数据授权。

凭据只用部署平台 secrets 管理，不写入 Wrangler vars、Git、队列、网页或桌面包。示例见 [.dev.vars.example](.dev.vars.example)。生产发布前核对构建产物、RLS、Auth、管理员授权、bucket 权限及真实端到端验收；配置齐全不等于已验收。

## 历史平台任务与结算（D-17 暂缓）

- 接单按用户请求 UUID 幂等；不同参数复用标识返回冲突。协调器事务内预占免费次数或积分，并预占日预算。达到容量、额度或预算上限时拒绝接单。
- 执行状态在调用供应商前持久化。超时、5xx、断连、崩溃和无效结果进入待核对，保留预占；消息重投不再次生图。
- 排队可取消并释放预占。已经执行的任务不把页面停止等待当成供应商取消。
- 管理员可恢复已入 R2 的原图回执，或在供应商确认未交付后释放预占；没有自动生成重试按钮。
- 平台生成原图与提示词保持可追踪，默认不自动过期。元数据同步不上传本机原图。若运营方调整平台原图保留策略，必须先更新用户说明并提供导出/删除流程，不能把未知结果静默删掉。
- 支付跳转不代表入账。通知须通过原始正文验签、五分钟时间窗和订单金额/币种核对；事件和订单双重幂等。
- 全额退款仅冻结尚可用的对应积分；未知结果保持冻结，用原退款标识核对。退款回执成功才结算，失败/取消恢复冻结积分。已消费或缺失支付凭证的订单拒绝自动全额退款。

## 历史平台管理与恢复（D-17 暂缓）

首次管理员通过既有可信 `admin-membership` 入口设置，不能由浏览器自授予。每项平台运维请求重新验证当前账号与管理员身份。策略、价格、核对与退款写审计；列表不返回用户私有提示词、原图、供应商 Key 或会话。

日预算、平台权威积分流水与客户端显式上报各自展示。与供应商/Stripe 对账时以外部账单和支付凭证核对，不能从图片数量推断真实费用。

本地 Supabase 仅用于测试。测试 Compose 项目与端口应独立，不重建其他工作区已有容器。持久数据迁移与回滚不通过删除库、队列或对象存储处理。
