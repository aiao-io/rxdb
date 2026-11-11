# aiao-model-design

从 `aiao-enterprise` 迁入的模型设计器，入口为 `/model-designer/canvas`。本地模型、画布位置、版本和 AI 会话保存在独立的 `aiao-model-design` SQLite 数据库中。

## 服务端范围

服务端只处理模型 AI，直接运行在 Cloudflare Workers：

| 接口                          | 用途                               | 响应                       |
| ----------------------------- | ---------------------------------- | -------------------------- |
| `POST /api/ai/model/generate` | 根据业务描述和现有实体生成模型     | SSE，增量 JSON 文本        |
| `POST /api/ai/model/chat`     | 对话式迭代模型，生成结构化变更提案 | SSE，增量对话文本          |
| `POST /bff/auth/signin`       | 使用已有 Supabase 账号登录         | 用户信息及 HttpOnly cookie |
| `GET /bff/auth/session`       | 获取用户，刷新过期会话             | 用户信息                   |
| `POST /bff/auth/signout`      | 退出当前登录                       | 清除会话 cookie            |
| `GET /health`                 | Worker 健康检查                    | `{ "ok": true }`           |

两个模型接口统一返回 `Content-Type: text/event-stream`，使用 AI SDK UI Message Stream 协议。客户端通过 POST `fetch` 持续读取 `text-delta` 事件；生成接口的 `delta` 拼接后为模型 JSON，对话接口的 `delta` 拼接后为回答文本：

```text
data: {"type":"text-delta","id":"0","delta":"文本片段"}

data: [DONE]

```

流中错误通过 `type: "error"` 事件返回，`errorText` 是包含 `type`、`message`、`status` 的错误 JSON 字符串。客户端收到错误或连接提前中断时不调用成功回调。响应带 `Cache-Control: no-store, no-transform`，逐段传递生成内容。

原 API 的语音、通用聊天、OpenAI / Anthropic 兼容网关、通知、PostgreSQL、远程 SQL 执行和 npm 发布均未保留。模型校验由设计器客户端完成。

模型 AI 请求必须通过 Supabase 用户验证。AI 密钥只在 Worker 中使用，JWT 保存在 HttpOnly cookie 中，响应不返回 JWT。写入接口检查同源，模型请求支持客户端取消和 120 秒超时。

独立 Worker 只提供本地模型设计、代码/SQL 预览和模型 AI。远程 schema 对比、SQL 执行以及客户端包归档/发布属于宿主应用能力；未注入对应 adapter 时，设计器会自动禁用这些入口，不会请求不存在的接口。

## 代码来源

- `packages/rxdb-model-designer/src` → `src/app/model-designer`：画布、实体编辑、代码与 SQL 预览、版本管理、AI 会话和提案流程。
- `packages/rxdb-models/entities` → `entities`，生成文件位于 `src/app/model-designer/models`。
- `apps/dashboard` → `src/app/adapters` 中的 AI 抽屉和 HTTP adapter。
- `apps/api/src/routes/gateway/project-compat/prompts` → `server/prompts`：保留模型生成、模型迭代提示词及生成输出 schema。服务端入口按 Worker 环境改写为 `server/ai.ts`、`server/edge` 和 `server/index.ts`。

## 本地运行

复制环境变量模板，填写同一个 Supabase 项目的 URL、publishable / anon key，以及 DeepSeek API key：

```bash
cp apps/aiao-model-design/.dev.vars.example apps/aiao-model-design/.dev.vars
pnpm nx run aiao-model-design:serve-api
```

该任务先构建 Angular，再启动本地 Worker。访问 `http://localhost:8788` 即可使用完整应用；AI 面板中的「账号」链接打开 `/login.html`。本地编辑不需要登录。

前端需要热更新时，保留 Worker 进程，在另一个终端运行：

```bash
pnpm nx serve aiao-model-design
```

开发代理默认把 `/api/**` 和 `/bff/**` 交给 `http://localhost:8788`。可以用 `MODEL_DESIGN_API_URL` 指定其他 Worker 地址。迁移预览配置仍使用 4201 端口：

```bash
pnpm nx run aiao-model-design:serve:migration
```

本地 Worker 的出站请求支持 `HTTPS_PROXY`、`HTTP_PROXY` 和 `NO_PROXY`。如果 Supabase 或 AI 服务只能通过代理访问，在启动时传入代理地址（端口以本机代理设置为准）：

```bash
HTTPS_PROXY=http://127.0.0.1:7897 pnpm nx run aiao-model-design:serve-api
```

代理配置只用于本地开发，Cloudflare 部署继续使用原生 Worker 网络。登录返回 `Authentication service is unavailable` 表示认证服务连接失败；账号密码错误会返回 401。

`.dev.vars` 和 `.wrangler/` 不提交。`DEEPSEEK_BASE_URL` 是完整 API 前缀，默认 `https://api.deepseek.com/v1`；`DEEPSEEK_MODEL` 默认 `deepseek-flash`。

## 部署到 Cloudflare

同一个 Worker 托管 Angular 静态资源、认证和模型 AI API。无需 Container、Bun 进程、数据库或 npm CLI。

先检查构建和 Worker 打包：

```bash
pnpm nx run aiao-model-design:build-server
```

在自己的 Cloudflare 账号登录并写入三个服务端 secret：

```bash
pnpm --dir apps/aiao-model-design exec wrangler login
pnpm --dir apps/aiao-model-design exec wrangler secret put SUPABASE_URL
pnpm --dir apps/aiao-model-design exec wrangler secret put SUPABASE_ANON_KEY
pnpm --dir apps/aiao-model-design exec wrangler secret put DEEPSEEK_API_KEY
```

需要自定义模型或代理地址时，再写入 `DEEPSEEK_MODEL`、`DEEPSEEK_BASE_URL`。不要把真实值写进 `wrangler.jsonc`。

部署：

```bash
pnpm nx run aiao-model-design:deploy-cloudflare
```

Worker 名称为 `aiao-model-design`。首次部署后访问 `/health`、`/login.html` 和 `/model-designer/canvas` 验证。当前仓库准备了配置与部署任务，实际线上部署需在配置账号和 secrets 后执行。

## 验证

```bash
pnpm nx run aiao-model-design:test-server --coverage
pnpm nx run aiao-model-design:typecheck-server
pnpm nx run aiao-model-design:test-worker
pnpm nx test aiao-model-design
pnpm nx run aiao-model-design:typecheck
pnpm nx lint aiao-model-design --max-warnings=0
pnpm nx run aiao-model-design:build-server
pnpm nx run aiao-model-design:generate-models
```

服务端覆盖率门槛为语句、分支、函数、行均至少 80%。原前端迁入基线覆盖率为语句 61.75%、行 63.64%，尚未达到仓库 80% 门槛。前端生产构建仍有原依赖的 CommonJS 提示和初始包大小告警。
