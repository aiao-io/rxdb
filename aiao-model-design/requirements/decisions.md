# 模型设计器决策

## D-01：应用需求独立管理

模型设计器使用 `MODEL-US-*` / `MODEL-EPIC-*` 编号，在本目录独立统计和验收。平台能力（版本控制、分支合并等）留在根 requirements，用 `capabilities` 引用；平台故事完成不代表本应用已接线或验收。结构门禁的校验逻辑与 Admin 应用共用 `scripts/audit/app-requirements.mjs`，各应用只绑定自己的前缀。

## D-02：智能体运行在自建 Trigger.dev，Worker 只签发会话

建模 AI 改为 Trigger.dev 的 `chat.agent` 持久会话，实例为自建部署（Docker 自托管的 webapp 与 worker）。Cloudflare Worker 只保留三件事：静态资源、Supabase 登录会话、为已登录用户签发 Trigger.dev 会话令牌（以 `TRIGGER_SECRET_KEY` 调用实例的 `POST /api/v1/sessions`）。浏览器拿到会话令牌后直接与实例的会话流通信。

旧的 `POST /api/ai/model/generate` / `POST /api/ai/model/chat` 与客户端的增量 JSON 解析链路整体删除，不保留兜底。未配置 Trigger.dev 时，Worker 的 `GET /api/agent/config` 返回不可用，设计器禁用 AI 入口，与未注入远程 schema 等适配器时的处理一致。

## D-03：本地模型是真相源

浏览器本地 RxDB 中的设计是模型真相源。每次发送消息时，浏览器把当前模型快照随消息元数据发出；智能体在服务端草稿上执行工具，草稿只活在当前轮，下一轮重新以浏览器快照为准。

工具输出携带操作日志 `ops`。浏览器按 `toolCallId` 幂等地把 ops 写进 AI 分支：首个写入到达时才 fork 分支，重放或重连时同一个 `toolCallId` 只写一次。合并或丢弃 AI 分支由用户决定，这是智能体自己完成不了的「第二把钥匙」；智能体不直接改动用户所在的分支。

会话状态（UI 消息、已写入的 `toolCallId`、回读基线、流游标）存在新的 `log: false` 实体里，不进版本化域，丢弃 AI 分支不会连带丢掉对话。迁移前的本地会话只读展示。

## D-04：结构约束放在工具里

模型只用名称引用实体、属性和关系（实体名在一个设计内唯一，属性名、关系名在实体内唯一），由工具解析成 ID。新对象的 UUID 由工具生成；`link_entities` 一次调用同时创建两端关系，关系种类互逆、`mappedPropertyId` 互相指向；删除实体时级联删除指向它的两端关系。命名、保留字、重名、枚举值与关系配对由前后端共享的纯函数 `packages/model-ops`（`@aiao-model-design/model-ops`） 校验，校验不过整批拒绝，并把逐条错误返回给模型。

提示词只写建模判断（范式、命名空间、何时提问），不再承担「严禁单向关系」「UUID 必须互相引用」这类结构约束。

## D-05：模型可切换，默认 DeepSeek

`apps/agent/src/model-designer.md` 的 frontmatter 以 `provider:model` 声明默认模型 `deepseek:deepseek-flash`。部署环境变量 `AGENT_MODEL` 可覆盖，当前支持 `deepseek`（`DEEPSEEK_API_KEY`，可选 `DEEPSEEK_BASE_URL`）与 `anthropic`（`ANTHROPIC_API_KEY`）。未知供应商或缺少对应密钥时，启动该轮直接报错，不静默换模型。模型密钥只配置在 Trigger.dev 实例的环境变量里，Worker 不再持有。

## D-06：自建实例的运行约束

自建 Trigger.dev 不支持 checkpoint，空闲的会话 run 不会挂起释放资源，而是占着 worker 等到 `turnTimeout` 再退出；下一条消息由会话触发续跑 run，从实例对象存储里的会话快照恢复对话历史。因此：

- `turnTimeout` 设为 15 分钟，限制空闲占用；更长的停顿由续跑 run 接上。
- 不依赖跨 run 的内存状态。草稿不放 `chat.local`：`tools` 选项每轮以本轮快照新建草稿并绑定工具（D-03）。
- 会话流使用实例自带的 s2-lite（realtime streams v2），无需额外配置。

会话归属由 Worker 判定：`chatId` 必须以 `md-<Supabase 用户 ID>-` 开头，Worker 只为本人的 `chatId` 签发令牌。令牌按会话授权，读写仅限该会话。

## D-07：验收分层

TDD 的主力是离线测试：共享纯函数单测，`mockChatAgent` 配合模拟语言模型驱动智能体的真实轮次循环与工具调用，Worker 以模拟 fetch 测试会话签发，Angular 以假的 `ChatTransport` 测试写入 AI 分支与会话恢复。这些都不需要网络或 Trigger.dev 账号。

需要真实自建实例、真实 DeepSeek 或真实浏览器会话流的 AC 单独成行，拿到真实环境证据前保持待验，并记在[验收台账](verification-report.md)。离线证据不能代替真实环境证据。

## D-08：AI 分支的 fork 记录持久化

数据库的检出分支会持久化，刷新页面后仍停在 AI 分支上。会话服务的分支状态如果只在内存里，合并入口会消失，续流写入还会在 AI 分支上再 fork 一层，合并时只合回外层的 AI 分支。所以 fork 时把分支、父分支与 fork 前的快照写进 `AgentBranch`（`log: false`，停在 AI 分支上也读得到），合并或丢弃后删除。服务启动时若当前检出的是 AI 分支，就按这条记录恢复预览；找不到记录时说明原因，交给用户在分支管理里处理，不去猜父分支。

## D-09：产品根目录与按运行时拆分

按[应用级需求与项目治理办法](../../requirements/application-governance.md)，模型设计器是多个 Nx 应用组成的一个产品，产品根放在仓库根的 `aiao-model-design/`（2026-11-12 用户拍板，三个选项是原地、仓库根与新建 `products/`）。按运行时拆成三个应用：`apps/web`（浏览器）、`apps/api`（Cloudflare Worker）、`apps/agent`（Trigger.dev）；web 与 agent 共用的模型操作抽成私有包 `@aiao-model-design/model-ops`。三者共用需求前缀 `MODEL` 与本目录。

产品根保留 `aiao-model-design` 这个 Nx 项目，承载需求门禁、安全门禁与聚合验证 `verify`；子项目名加后缀。应用之间不互相 import 源码，api 部署时只读取 web 的构建产物。私有包只放纯函数，经 tsconfig paths 按源码消费，不进公开 API 基线与发布流程。

## D-10：本地开发环境

2026-11-12 用户拍板（AskUserQuestion），参照 aiao-media 的 `nx dev`：

- **登录走本地 Supabase（Docker）**，不用模拟认证，也不沿用 `.dev.vars` 里的远端项目。只起登录需要的 Postgres、GoTrue 与 Kong（与 Supabase 一样校验 apikey、剥掉 `/auth/v1/` 前缀），放在产品根 `infra/supabase/`。端口固定为 54421、54422，与 aiao-media 的 543xx 错开；凭据首次运行时随机生成。设计器只用已有账号登录，所以关闭注册，两个测试账号经管理接口创建并确认。
- **智能体按密钥类型自动接入**：`apps/api/.dev.vars` 两项都没配时禁用 AI 入口；开发环境密钥（`tr_dev_`）顺带启动 `trigger dev`（用 README 约定的 `self-hosted` 登录配置或 `TRIGGER_ACCESS_TOKEN`，需要 `TRIGGER_PROJECT_REF` 与 `.env.agent`）；其他环境密钥使用实例上已部署的版本。配置不完整或无效时在启动服务前报错，不当作未配置。自建 Trigger.dev 实例不纳入 `nx dev`：它有十来个容器，首次建项目与取 PAT 难以自动化。

开发导航由本地 Worker 在根路径提供：`dev-config` 把 Worker 的静态资源目录换成生成的导航页，Web 走 Angular 开发服务器，把 `/api/**`、`/bff/**` 代理给 Worker，所以 `nx dev` 不需要先构建 web。Web 4400、Worker 8788 两个端口固定，被占用时报错退出，不自动换端口。导航页含测试账号与本地数据库密码，只由绑定 127.0.0.1 的 Worker 提供，不进 web 构建产物，也不含任何服务端密钥。

## D-11：取消版本管理功能，待重新设计

2026-11-13 用户拍板：取消设计器的版本管理功能，后续重新设计。现有实现把「另一个模型设计」当快照做实体集对比，并用它整体覆盖回滚目标设计——这与平台版本控制（US-301）和 AI 分支（D-08）语义重叠、方向未定，先撤下入口避免误导。

移除范围：`version-manager` 弹窗组件与其测试、`DesignDiffService` 与其测试、`ModelDesignService.rollback` 与二次确认文案、工具栏两处入口与 i18n 版本管理文案。`copy` 与快照克隆工具保留，复制设计不受影响；RxDB 自带的版本管理器插件（撤销/重做、AI 分支的 fork/merge/discard）不受影响，D-08 中「交给用户在版本管理里处理」同步改为「分支管理」。

重新设计时的输入：平台 US-301 版本控制、AI 分支的 fork 记录恢复（D-08），以及 SQL 执行弹窗已有的 rollback-only 预检。
