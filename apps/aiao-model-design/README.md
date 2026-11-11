# aiao-model-design

从 `aiao-enterprise` 迁入的模型设计器，入口为 `/model-designer/canvas`。本地模型、画布位置、版本和 AI 会话保存在独立的 `aiao-model-design` SQLite 数据库中。产品需求、决策与验收台账见 [requirements](requirements/README.md)。

## 架构

建模 AI 是运行在自建 Trigger.dev 上的持久智能体，做法参考 [rendi](https://github.com/mcheemaa/rendi)。三部分各管一件事：

| 部分                      | 位置      | 职责                                                                                            |
| ------------------------- | --------- | ----------------------------------------------------------------------------------------------- |
| 浏览器（Angular）         | `src/`    | 模型的真相源（本地 RxDB）；每轮把模型快照发给智能体，把工具产出按 `toolCallId` 幂等写进 AI 分支 |
| Cloudflare Worker         | `server/` | 静态资源、Supabase 登录会话、为本人的会话签发 Trigger.dev 令牌；不持有模型密钥                  |
| 建模智能体（Trigger.dev） | `agent/`  | `chat.agent` 持久会话；在草稿上执行建模工具，校验失败把原因还给模型                             |
| 共享模块                  | `shared/` | 前后端共用的快照类型、操作日志、校验、差异与概要                                                |

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

- [agent/model-designer.md](agent/model-designer.md)：frontmatter 声明名称、默认模型（`deepseek:deepseek-flash`）与工具清单，正文是系统提示词。清单里有未注册的工具时启动即失败。
- [agent/tools/](agent/tools/index.ts)：一工具一文件。工具只收名称、不收 UUID；新对象的 ID 由工具生成，`link_entities` 一次创建两端关系，删除实体时清理指向它的关系。
- [agent/chat.ts](agent/chat.ts)：每轮用浏览器快照新建草稿并绑定工具，在最新用户消息之前注入 `<model_state>` 与 `<since_your_last_turn>` 回读块。
- 模型：`AGENT_MODEL` 覆盖默认模型，支持 `deepseek:<model>`（`DEEPSEEK_API_KEY`，可选 `DEEPSEEK_BASE_URL`）与 `anthropic:<model>`（`ANTHROPIC_API_KEY`，可选 `ANTHROPIC_BASE_URL`）。

## 本地运行

只编辑本地模型不需要登录，也不需要 Trigger.dev。要用 AI 时：

1. 复制 Worker 环境变量模板，填写 Supabase 与自建实例的地址、环境密钥：

   ```bash
   cp apps/aiao-model-design/.dev.vars.example apps/aiao-model-design/.dev.vars
   pnpm nx run aiao-model-design:serve-api
   ```

   该任务先构建 Angular，再在 `http://localhost:8788` 启动本地 Worker；AI 面板中的「登录」链接打开 `/login.html`。

2. 在自建实例上登录 CLI，并启动智能体的开发会话（项目 ref 在实例控制台里创建项目后获得）：

   ```bash
   pnpm --dir apps/aiao-model-design exec trigger login --api-url https://trigger.example.com --profile self-hosted
   cp apps/aiao-model-design/.env.agent.example apps/aiao-model-design/.env.agent
   export TRIGGER_PROJECT_REF=proj_xxx
   pnpm nx run aiao-model-design:agent-dev -- --profile self-hosted
   ```

   `.env.agent` 填模型密钥，由 `trigger dev` 注入开发会话；项目 ref 要在 shell 里导出，`trigger.config.ts` 在 CLI 求值时读取。Worker 的 `TRIGGER_SECRET_KEY` 用该项目开发环境的密钥。

从旧版升级时，`.dev.vars` 里的 `DEEPSEEK_API_KEY`、`DEEPSEEK_BASE_URL`、`DEEPSEEK_MODEL` 已不被 Worker 读取，可以删除：前两项原样移到 `.env.agent`（部署后配置到实例的环境变量），`DEEPSEEK_MODEL="x"` 改写为 `AGENT_MODEL="deepseek:x"`。旧版经 OpenAI 兼容的 Responses 接口（`<DEEPSEEK_BASE_URL>/responses`）调用模型，新版调用 Chat Completions 接口（`<DEEPSEEK_BASE_URL>/chat/completions`）；`DEEPSEEK_BASE_URL` 指向中转服务时，要确认它提供后者。

前端需要热更新时，保留 Worker 进程，在另一个终端运行 `pnpm nx serve aiao-model-design`；开发代理默认把 `/api/**` 和 `/bff/**` 交给 `http://localhost:8788`，可用 `MODEL_DESIGN_API_URL` 指定其他 Worker 地址。迁移预览配置仍使用 4201 端口：`pnpm nx run aiao-model-design:serve:migration`。

本地 Worker 的出站请求支持 `HTTPS_PROXY`、`HTTP_PROXY` 和 `NO_PROXY`，代理只用于本地开发：

```bash
HTTPS_PROXY=http://127.0.0.1:7897 pnpm nx run aiao-model-design:serve-api
```

登录返回 `Authentication service is unavailable` 表示认证服务连接失败；账号密码错误会返回 401。`.dev.vars`、`.env.agent` 和 `.wrangler/` 不提交。

## 部署

### 智能体（自建 Trigger.dev）

实例按 Trigger.dev 官方的 [Docker 自托管文档](https://trigger.dev/docs/self-hosting/docker) 搭建（webapp 与 worker）。自建实例不支持 checkpoint：会话空闲时 run 会一直占着 worker，直到 `turnTimeout`（15 分钟）后退出，下一条消息再由续跑 run 从对象存储的会话快照恢复。

在实例控制台为生产环境配置 `DEEPSEEK_API_KEY`（以及需要时的 `AGENT_MODEL`、`DEEPSEEK_BASE_URL`），然后部署：

```bash
export TRIGGER_PROJECT_REF=proj_xxx
pnpm nx run aiao-model-design:agent-deploy -- --profile self-hosted
```

部署前会先跑 Node 侧测试与智能体类型检查。

### Worker（Cloudflare）

同一个 Worker 托管 Angular 静态资源、认证和会话签发。先检查构建和 Worker 打包：

```bash
pnpm nx run aiao-model-design:build-server
```

在自己的 Cloudflare 账号登录并写入四个服务端 secret（`TRIGGER_SECRET_KEY` 用实例生产环境的密钥）：

```bash
pnpm --dir apps/aiao-model-design exec wrangler login
pnpm --dir apps/aiao-model-design exec wrangler secret put SUPABASE_URL
pnpm --dir apps/aiao-model-design exec wrangler secret put SUPABASE_ANON_KEY
pnpm --dir apps/aiao-model-design exec wrangler secret put TRIGGER_API_URL
pnpm --dir apps/aiao-model-design exec wrangler secret put TRIGGER_SECRET_KEY
pnpm nx run aiao-model-design:deploy-cloudflare
```

Worker 名称为 `aiao-model-design`。部署后访问 `/health`、`/api/agent/config`、`/login.html` 和 `/model-designer/canvas` 验证。不要把真实值写进 `wrangler.jsonc`。

## 验证

```bash
pnpm nx run aiao-model-design:requirements-test
pnpm nx run aiao-model-design:requirements-check
pnpm nx run aiao-model-design:test-node
pnpm nx run aiao-model-design:typecheck
pnpm nx test aiao-model-design
pnpm nx lint aiao-model-design --max-warnings=0
pnpm nx run aiao-model-design:build-server
pnpm nx run aiao-model-design:test-worker
pnpm nx run aiao-model-design:generate-models
```

`test-node` 覆盖 Worker、智能体与共享模块，门槛为语句、分支、函数、行均至少 80%；智能体测试用 `mockChatAgent` 驱动真实的轮次循环，不需要网络或实例。`test-worker` 在 wrangler 本地运行时里验证路由、会话签发与登录流程。原前端迁入基线覆盖率为语句 61.75%、行 63.64%，尚未达到仓库 80% 门槛。

## 代码来源

- `packages/rxdb-model-designer/src` → `src/app/model-designer`：画布、实体编辑、代码与 SQL 预览、版本管理、AI 会话面板。
- `packages/rxdb-models/entities` → `entities`，生成文件位于 `src/app/model-designer/models`；`AgentConversation` 为本应用新增。
- `apps/dashboard` → `src/app/adapters` 中的 AI 抽屉与网关适配器。
