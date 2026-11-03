# aiao-vscode Cloudflare Pages 部署

本目录是工作台的 Cloudflare Pages 部署单元：静态站点（`dist/browser`）+ 三个 Pages Functions。
GitHub 认证链路与 [vscode.dev](../../../requirements/domain-research/vscode-dev-github-integration.md)
同构：`/redirect` 中转 + 同源 token 交换端点持 client secret，浏览器永不接触 secret。

| 路由                            | 作用                                                             |
| ------------------------------- | ---------------------------------------------------------------- |
| `GET /redirect`                 | GitHub OAuth 回跳落点：校验 state 后 302 回 `/github-callback`   |
| `POST /api/github-token`        | 授权码 → access_token（PKCE code_verifier + client secret 交换） |
| `POST /api/github-token/delete` | 服务端撤销 OAuth token（登出时调用）                             |

## 首次部署步骤

1. **注册 GitHub OAuth App**（Settings → Developer settings → OAuth Apps）：
   - Homepage URL：`https://<部署域>/`
   - Authorization callback URL：`https://<部署域>/redirect`
   - 生成 Client secret（只存服务端）
2. **写入 clientId 到应用配置**：OAuth App 的 client id 是公开值，填进
   `src/workbench/git/github/github-service.ts` 的 `PENDING_GITHUB_CLIENT_ID` 占位处
   （部署配置默认读该常量；未替换时 OAuth 登录会明确报错，PAT 登录不受影响）。
3. **注入 secret**：
   ```bash
   wrangler secret put GITHUB_CLIENT_ID
   wrangler secret put GITHUB_CLIENT_SECRET
   ```
4. **构建并部署**：
   ```bash
   pnpm nx build aiao-vscode
   wrangler pages deploy --project-name aiao-vscode
   ```
   Pages 关联本仓库后也可由 CI 用 `@cloudflare/pages-action` 自动部署。

## 本地联调

```bash
pnpm nx build aiao-vscode
cp .dev.vars.example .dev.vars   # 填入真实值
wrangler pages dev
```

`wrangler pages dev` 同端口提供静态站点与 Functions，走完整 OAuth 链路；
纯 vite 开发服务器（4320）没有 Functions，登录先用 PAT 兜底。

## 验证

- Functions 行为回归：`node deploy/verify-functions.mjs`（Node ≥ 26 直跑，无需 wrangler）。
- 真实授权链路：部署后访问 `https://<域>/redirect?code=x&state=https%3A%2F%2F<域>%2Fgithub-callback%3Fnonce%3Da`
  应 302 回同域 `/github-callback`；完整 OAuth 走查在工作台登录入口进行。
- 跨域隔离响应头（COOP / COEP）与 Service Worker 是工作台自身要求，配置见应用 README 的部署小节。

## 安全边界

- client secret 只存在于 wrangler secret / `.dev.vars`，不进仓库、不进前端。
- `/redirect` 拒绝非同源或非 `/github-callback` 的 state，防开放重定向。
- 交换端点只做「code → token」与「token 撤销」两件事，不代理任何其他 API 流量；
  其余 GitHub 请求由浏览器直连 `api.github.com`（CORS 实测可用）。
