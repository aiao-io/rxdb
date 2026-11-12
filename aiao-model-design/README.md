# aiao-model-design

从 `aiao-enterprise` 迁入的模型设计器，入口为 `/model-designer/canvas`。本地模型、画布位置、版本和 AI 会话保存在独立的 `aiao-model-design` SQLite 数据库中。

这是一个产品根目录：三个 Nx 应用和一个产品私有包共同组成同一个产品，按[应用级需求与项目治理办法](../requirements/application-governance.md)管理。产品需求、决策与验收台账见 [requirements](requirements/README.md)，目录边界与依赖规则见 [AGENTS.md](AGENTS.md)。

## 结构

建模 AI 是运行在自建 Trigger.dev 上的持久智能体，做法参考 [rendi](https://github.com/mcheemaa/rendi)。

| 目录                                     | Nx 项目                       | 运行时              | 职责                                                                                                         |
| ---------------------------------------- | ----------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------ |
| [apps/web](apps/web)                     | `aiao-model-design-web`       | 浏览器（Angular）   | 模型的真相源（本地 RxDB）；每轮把模型快照发给智能体，把工具产出按 `toolCallId` 幂等写进 AI 分支              |
| [apps/api](apps/api)                     | `aiao-model-design-api`       | Cloudflare Worker   | 静态资源、Supabase 登录会话、为本人的会话签发 Trigger.dev 令牌；不持有模型密钥                               |
| [apps/agent](apps/agent)                 | `aiao-model-design-agent`     | Trigger.dev（Node） | `chat.agent` 持久会话；在草稿上执行建模工具，校验失败把原因还给模型                                          |
| [packages/model-ops](packages/model-ops) | `aiao-model-design-model-ops` | 无（纯函数）        | `@aiao-model-design/model-ops`：web 与 agent 共用的快照类型、操作、校验、差异与概要                          |
| 产品根（本目录）                         | `aiao-model-design`           | —                   | 需求门禁、安全门禁、一次跑完全部门禁的 `verify`，以及本地开发环境 `dev`（`scripts/dev/`、`infra/supabase/`） |

Worker 接口：

| 接口                      | 用途                                                          | 响应                        |
| ------------------------- | ------------------------------------------------------------- | --------------------------- |
| `GET /api/agent/config`   | 智能体是否可用、实例地址、任务 ID                             | `{ enabled, apiUrl, task }` |
| `POST /api/agent/session` | 为已登录用户的 `chatId`（`md-<用户 ID>-…`）创建或刷新会话令牌 | `{ publicAccessToken }`     |
| `POST /bff/auth/signin`   | 使用已有 Supabase 账号登录                                    | 用户信息及 HttpOnly cookie  |
| `GET /bff/auth/session`   | 获取用户，刷新过期会话                                        | 用户信息                    |
| `POST /bff/auth/signout`  | 退出当前登录                                                  | 清除会话 cookie             |
| `GET /health`             | Worker 健康检查                                               | `{ "ok": true }`            |

浏览器拿到会话令牌后，用 `@trigger.dev/sdk/chat` 的 `TriggerChatTransport` 直接连实例的会话流；写入接口检查同源，令牌只能读写该会话。未配置 Trigger.dev 或未登录时，设计器禁用 AI 入口并说明原因。迁移前的本地 AI 会话只读展示。

## 智能体

- [model-designer.md](apps/agent/src/model-designer.md)：frontmatter 声明名称、默认模型（`deepseek:deepseek-flash`）与工具清单，正文是系统提示词。清单里有未注册的工具时启动即失败。
- [tools/](apps/agent/src/tools/index.ts)：一工具一文件。工具只收名称、不收 UUID；新对象的 ID 由工具生成，`link_entities` 一次创建两端关系，删除实体时清理指向它的关系。
- [chat.ts](apps/agent/src/chat.ts)：每轮用浏览器快照新建草稿并绑定工具，在最新用户消息之前注入 `<model_state>` 与 `<since_your_last_turn>` 回读块。
- 模型：`AGENT_MODEL` 覆盖默认模型，支持 `deepseek:<model>`（`DEEPSEEK_API_KEY`，可选 `DEEPSEEK_BASE_URL`）与 `anthropic:<model>`（`ANTHROPIC_API_KEY`，可选 `ANTHROPIC_BASE_URL`）。

## 本地运行

切到 Node 26、启动 Docker，然后在仓库根执行：

```bash
pnpm nx dev aiao-model-design
```

它依次检查固定端口，拉起只服务登录的本地 Supabase（Postgres、GoTrue 与 Kong 网关；首次运行在 `infra/supabase/.env` 生成随机凭据），准备测试账号与本地 Worker 配置，再启动 Worker 与支持热更新的 Web，并按 `apps/api/.dev.vars` 的配置接入智能体。全部就绪后自动打开[开发导航](http://127.0.0.1:8788/)：服务入口、测试账号、AI 接入状态与数据库连接都在这一页，可一键复制。不想自动打开浏览器时用 `AIAO_DEV_OPEN=false pnpm nx dev aiao-model-design`。

| 服务                     | 地址                                          |
| ------------------------ | --------------------------------------------- |
| 设计器（Web）            | <http://localhost:4400/model-designer/canvas> |
| 登录页                   | <http://localhost:4400/login.html>            |
| 开发导航 / Worker        | <http://127.0.0.1:8788/>                      |
| Supabase Auth（经 Kong） | <http://127.0.0.1:54421/auth/v1>              |
| PostgreSQL               | `127.0.0.1:54422`，用户 `postgres`            |

| 测试账号             | 密码             | 用途                   |
| -------------------- | ---------------- | ---------------------- |
| `designer@aiao.test` | `AiaoDesign123!` | 主账号                 |
| `reviewer@aiao.test` | `AiaoReview123!` | 验证 AI 会话按用户隔离 |

测试账号已确认邮箱；再次启动保留账号 ID 与数据，密码恢复为默认值。本地 Supabase 关闭了注册，新账号只能经管理接口创建。`nx dev` 下登录只走本地 Supabase，`.dev.vars` 里的 `SUPABASE_*` 不生效。

端口固定：被占用时先停掉占用的服务再启动，不会自动换端口。Supabase 的端口在已提交的 `infra/supabase/ports.env`，与 aiao-media 的 543xx 错开。多个检出目录用同一套端口，不能同时启动；可用 `COMPOSE_PROJECT_NAME` 隔离数据卷。

### 接入智能体

`nx dev` 按 `apps/api/.dev.vars` 里的 `TRIGGER_API_URL` 与 `TRIGGER_SECRET_KEY` 决定怎么接智能体：

| `.dev.vars` 的配置                                   | 接入方式                                                    |
| ---------------------------------------------------- | ----------------------------------------------------------- |
| 两项都没填                                           | 不启用，设计器的 AI 入口禁用并说明原因                      |
| 开发环境密钥（`tr_dev_`）                            | 同时启动 `trigger dev` 智能体开发会话，改智能体代码即时生效 |
| 其他环境密钥（`tr_prod_`、`tr_stg_`、`tr_preview_`） | 使用实例上已部署的智能体                                    |

只填一项、地址不是 http(s) 或密钥不是环境密钥时，启动前直接报错。开发会话还需要下面三样，缺项目 ref 或 `.env.agent` 时也在启动前报错：

```bash
# 1. 在自建实例上登录 CLI，--api-url 与 TRIGGER_API_URL 一致（也可以在环境里提供 TRIGGER_ACCESS_TOKEN）
pnpm --dir aiao-model-design/apps/agent exec trigger login --api-url https://trigger.example.com --profile self-hosted
# 2. 项目 ref：在实例控制台里创建项目后获得
export TRIGGER_PROJECT_REF=proj_xxx
# 3. 模型密钥：复制后填写，由 trigger dev 注入开发会话
cp aiao-model-design/apps/agent/.env.agent.example aiao-model-design/apps/agent/.env.agent
```

项目 ref 由 CLI 从环境变量 `TRIGGER_PROJECT_REF` 读取，覆盖 `trigger.config.ts` 里的占位值；配置文件本身不读环境变量，因为部署镜像里的索引与运行进程也会加载它。只跑智能体开发会话时用 `pnpm nx run aiao-model-design-agent:dev -- --profile self-hosted`。

### 停止与日志

交互终端默认用 Nx TUI，可切换查看 Web、Worker、智能体与 Supabase 日志；加 `--output-style=stream` 输出普通日志。Ctrl-C 停止应用与日志进程，Supabase 容器继续运行并保留数据：

```bash
pnpm nx run aiao-model-design:supabase-status   # 查看容器状态
pnpm nx run aiao-model-design:supabase-down     # 停止容器，保留数据卷
```

本地 Worker 的配置、密钥与导航页生成在忽略的 `apps/api/.wrangler/local-dev/`，不改 `.dev.vars` 与 `wrangler.jsonc`。Web 走 Angular 开发服务器，把 `/api/**`、`/bff/**` 代理给 Worker，不需要先构建。导航页只由绑定 127.0.0.1 的本地 Worker 提供，含测试账号与数据库密码，不进 web 构建产物；JWT secret、service role key 与 Trigger.dev 密钥都不写进页面。

### 其他运行方式

只改前端、不需要登录时用 `pnpm nx serve aiao-model-design-web`（<http://localhost:4200>，不需要 Docker）；开发代理默认把 `/api/**` 和 `/bff/**` 交给 `http://127.0.0.1:8788`，可用 `MODEL_DESIGN_API_URL` 指定其他 Worker 地址。迁移预览配置使用 4201 端口：`pnpm nx run aiao-model-design-web:serve:migration`。

按生产形态在本地预览（Worker 托管 web 的构建产物，登录走 `.dev.vars` 里配置的 Supabase 项目）：

```bash
cp aiao-model-design/apps/api/.dev.vars.example aiao-model-design/apps/api/.dev.vars
pnpm nx run aiao-model-design-api:serve
```

该任务先构建 web，再在 `http://localhost:8788` 启动本地 Worker，与 `nx dev` 用同一个端口，不能同时运行。本地 Worker（`nx dev` 与 `serve` 都是）的出站请求支持 `HTTPS_PROXY`、`HTTP_PROXY` 和 `NO_PROXY`，代理只用于本地开发；`NO_PROXY` 默认含 localhost 与 127.0.0.1，本地 Supabase 不走代理：

```bash
HTTPS_PROXY=http://127.0.0.1:7897 pnpm nx run aiao-model-design-api:serve
```

登录返回 `Authentication service is unavailable` 表示认证服务连接失败；账号密码错误会返回 401。`.dev.vars`、`.env.agent`、`infra/supabase/.env`、`.wrangler/` 与 `.trigger/` 不提交。

从旧版升级时，`.dev.vars` 里的 `DEEPSEEK_API_KEY`、`DEEPSEEK_BASE_URL`、`DEEPSEEK_MODEL` 已不被 Worker 读取，可以删除：前两项原样移到 `.env.agent`（部署后配置到实例的环境变量），`DEEPSEEK_MODEL="x"` 改写为 `AGENT_MODEL="deepseek:x"`。旧版经 OpenAI 兼容的 Responses 接口（`<DEEPSEEK_BASE_URL>/responses`）调用模型，新版调用 Chat Completions 接口（`<DEEPSEEK_BASE_URL>/chat/completions`）；`DEEPSEEK_BASE_URL` 指向中转服务时，要确认它提供后者。旧目录 `apps/aiao-model-design/` 下的 `.dev.vars` 要移到 `aiao-model-design/apps/api/`。

## 部署

### 智能体（自建 Trigger.dev）

实例按 Trigger.dev 官方的 [Docker 自托管文档](https://trigger.dev/docs/self-hosting/docker) 搭建（webapp 与 worker）。自建实例不支持 checkpoint：会话空闲时 run 会一直占着 worker，直到 `turnTimeout`（15 分钟）后退出，下一条消息再由续跑 run 从对象存储的会话快照恢复。

在实例控制台为生产环境配置 `DEEPSEEK_API_KEY`（以及需要时的 `AGENT_MODEL`、`DEEPSEEK_BASE_URL`），然后部署：

```bash
export TRIGGER_PROJECT_REF=proj_xxx
pnpm nx run aiao-model-design-agent:deploy -- --profile self-hosted
```

部署前会先跑 agent 的测试与类型检查。

### Worker（Cloudflare）

同一个 Worker 托管 web 的静态资源、认证和会话签发。先检查构建和 Worker 打包：

```bash
pnpm nx run aiao-model-design-api:build
```

在自己的 Cloudflare 账号登录并写入四个服务端 secret（`TRIGGER_SECRET_KEY` 用实例生产环境的密钥）：

```bash
pnpm --dir aiao-model-design/apps/api exec wrangler login
pnpm --dir aiao-model-design/apps/api exec wrangler secret put SUPABASE_URL
pnpm --dir aiao-model-design/apps/api exec wrangler secret put SUPABASE_ANON_KEY
pnpm --dir aiao-model-design/apps/api exec wrangler secret put TRIGGER_API_URL
pnpm --dir aiao-model-design/apps/api exec wrangler secret put TRIGGER_SECRET_KEY
pnpm nx run aiao-model-design-api:deploy
```

Worker 名称为 `aiao-model-design`。部署后访问 `/health`、`/api/agent/config`、`/login.html` 和 `/model-designer/canvas` 验证。不要把真实值写进 `wrangler.jsonc`。

## 验证

```bash
pnpm nx run aiao-model-design:verify
```

`verify` 依次跑完产品的全部门禁：需求结构门禁与夹具测试、四个子项目的 lint / typecheck / test、web 构建与 Worker 打包、Worker 本地运行时测试（`test-worker`），以及安全门禁（`security-check`：web 构建产物里不能出现服务端密钥）。也可以单独跑某一项，比如 `pnpm nx run aiao-model-design-agent:test`。

api、agent 与 model-ops 的测试门槛为语句、分支、函数、行均至少 80%；智能体测试用 `mockChatAgent` 驱动真实的轮次循环，不需要网络或实例。`test-worker` 在 wrangler 本地运行时里验证路由、会话签发与登录流程。web 的前端迁入基线覆盖率为语句 61.75%、行 63.64%，尚未达到仓库 80% 门槛。改了实体后用 `pnpm nx run aiao-model-design-web:generate-models` 重新生成模型。

## 代码来源

- `packages/rxdb-model-designer/src` → `apps/web/src/app/model-designer`：画布、实体编辑、代码与 SQL 预览、版本管理、AI 会话面板。
- `packages/rxdb-models/entities` → `apps/web/entities`，生成文件位于 `apps/web/src/app/model-designer/models`；`AgentConversation`、`AgentBranch` 为本产品新增。
- `apps/dashboard` → `apps/web/src/app/adapters` 中的 AI 抽屉与网关适配器。
