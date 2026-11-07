# aiao-vscode Cloudflare Pages 部署

本目录是工作台的 Cloudflare Pages 部署单元：静态站点（`dist/browser`）与 Pages Functions。
GitHub 认证链路与 [vscode.dev](../../../requirements/domain-research/vscode-dev-github-integration.md)
同构：`/redirect` 中转 + 同源 token 交换端点持 client secret，浏览器永不接触 secret。

| 路由                            | 作用                                                             |
| ------------------------------- | ---------------------------------------------------------------- |
| `GET /redirect`                 | GitHub OAuth 回跳落点：校验 state 后 302 回 `/github-callback`   |
| `GET /api/github-token`         | 返回公开的 OAuth Client ID，供前端发起授权                       |
| `POST /api/github-token`        | 授权码 → access_token（PKCE code_verifier + client secret 交换） |
| `POST /api/github-token/delete` | 服务端撤销 OAuth token（登出时调用）                             |

## 首次部署步骤

1. **注册 GitHub OAuth App**（Settings → Developer settings → OAuth Apps）：
   - Homepage URL：`https://vscode.aiao.io/`
   - Authorization callback URL：`https://vscode.aiao.io/redirect`
   - 生成 Client secret（只存服务端）
2. **创建 Cloudflare Pages 项目** `aiao-vscode`，并将 `vscode.aiao.io` 绑定到该项目。
   使用其他部署域名时，OAuth App 的 Homepage URL 与回调地址也使用该域名。
3. **注入同一个 OAuth App 的配置**，在仓库根进入本目录执行：
   ```bash
   cd apps/aiao-vscode/deploy
   pnpm dlx wrangler pages secret put GITHUB_CLIENT_ID --project-name aiao-vscode
   pnpm dlx wrangler pages secret put GITHUB_CLIENT_SECRET --project-name aiao-vscode
   ```
   前端发起 OAuth 时从同源 `GET /api/github-token` 读取公开 Client ID；Client secret 始终留在服务端。
   无需修改前端代码或 `PENDING_GITHUB_CLIENT_ID` 常量；缺失配置时登录入口会显示错误。
4. **构建并部署**：先在仓库根构建，再从本目录部署静态站点和 Functions：
   ```bash
   pnpm nx build aiao-vscode
   cd apps/aiao-vscode/deploy
   pnpm dlx wrangler pages deploy --project-name aiao-vscode --branch main
   ```
   首次采用本配置读取方式时需要重新构建并部署；后续调整服务端配置也需要重新部署以使绑定生效。
   `main` 对应生产环境和 `vscode.aiao.io`；省略 `--branch main` 会按当前 Git 分支发布，可能只更新 Preview。

## 本地联调

在仓库根执行：

```bash
pnpm nx build aiao-vscode
cd apps/aiao-vscode/deploy
cp .dev.vars.example .dev.vars   # 填入真实值
pnpm dlx wrangler pages dev --port 8788
```

为本地使用的 OAuth App 配置 Homepage URL `http://localhost:8788/`、
Authorization callback URL `http://localhost:8788/redirect`，并从 `http://localhost:8788/` 访问。
`wrangler pages dev` 同端口提供静态站点与 Functions，走完整 OAuth 链路；
纯 vite 开发服务器（4320）没有 Functions，登录先用 PAT 兜底。

## 验证

- Functions 行为回归：在仓库根执行 `pnpm nx run aiao-vscode:verify-functions`。
- 静态路由回归：在仓库根执行 `pnpm nx run aiao-vscode:verify-pages-routing`（连带生产构建）。脚本用
  `wrangler pages dev` 在本地托管 `dist/browser`，逐个确认 `browser-workbench-assets` 下的 `.html` 原样 200 返回，
  且不在 Service Worker 的导航回退范围内。Pages 默认把 `.html` 308 到无扩展名地址，工作台 iframe
  （Markdown 扩展宿主、VS Code webview）经 Service Worker 导航时不跟随这类重定向：没有 `public/_redirects`
  的 200 改写，Markdown 预览会变成错误页，或被回退成整个工作台。同一脚本再托管 vivari 宿主产物
  （`runtime-hosts/dist/vivari`），确认宿主页、预览容器页、`/sw.js`、`/assets/`、`/vendor/` 原样 200 并带全套宿主响应头，
  只有 `/assets/` 长缓存（见下节）。
- 公开配置检查：访问 `https://vscode.aiao.io/api/github-token`，应返回 `{"clientId":"实际 Client ID"}`；
  不应包含 Client secret。缺失配置时返回 503。
- 点击「使用 GitHub 账号登录」后，授权 URL 的 `client_id` 应为上述真实值，不能是 `pending-aiao-vscode-oauth-app`。
- 真实授权链路：部署后访问 `https://<域>/redirect?code=x&state=https%3A%2F%2F<域>%2Fgithub-callback%3Fnonce%3Da`
  应 302 回同域 `/github-callback`；完整 OAuth 走查在工作台登录入口进行。
- 完整登录成功后，授权弹窗应自动关闭，原工作台更新登录状态；失败时保留回调页显示错误。
  工作台启用 `COOP: same-origin`，跨域授权后 `window.opener` 可能为空，回调关闭不能依赖它。
- 跨域隔离响应头（COOP / COEP）与 Service Worker 是工作台自身要求，配置见应用 README 的部署小节。

## vivari 运行时宿主

vivari 跑在独占一个源的宿主页里（原因见应用 README 的[运行时宿主](../README.md#运行时宿主)）：线上是单独的 Pages 项目
`aiao-vscode-vivari`，域名 `vscode-vivari.aiao.io`，对应 `src/runtime-hosts/hosts.ts` 里 vivari 的线上映射。只有静态文件，没有 Functions。

首次部署：

1. 新建项目：`pnpm dlx wrangler@4.158.0 pages project create aiao-vscode-vivari --production-branch main`。
2. 在 Pages 面板给项目绑定自定义域名 `vscode-vivari.aiao.io`。不开 Web Analytics：它会往宿主页注入脚本。

每次部署（在仓库根执行；部署那步进 `apps/aiao-vscode`，那里没有 wrangler.toml，wrangler 只认命令行给的目录。
**宿主先于工作台**：工作台带上映射后就会去连宿主）：

```bash
pnpm nx run aiao-vscode:runtime-hosts
cd apps/aiao-vscode
pnpm dlx wrangler@4.158.0 pages deploy runtime-hosts/dist/vivari --project-name aiao-vscode-vivari --branch main
```

产物里的 `_headers`、`_redirects` 由构建按部署配置生成：全站 COOP / COEP / CORP 与 `frame-ancestors 'self' https://vscode.aiao.io`，
宿主页与预览容器页 200 改写；带内容哈希的 `/assets/` 长缓存，`/vendor/` 打包件的地址固定、内容随 `@vivari/core` 版本变，
显式 `no-cache`。aiao.io 的 zone 浏览器缓存 TTL 是 4 小时，会把 .js、.bin 这类静态扩展名的 `Cache-Control`
改成 `max-age=14400`，**连显式的 `no-cache` 也覆盖**（.html / .json 不受影响；pages.dev 上没有这层）。所以宿主页的入口脚本
由构建加内容哈希（`host-<哈希>.js`）；`/sw.js` 不受影响（Service Worker 更新检查不走 HTTP 缓存）；`/vendor/*.bin` 的地址是
vivari 写死的，要让 `no-cache` 生效，得在 zone 上给 `vscode-vivari.aiao.io` 加一条缓存规则，浏览器 TTL 选「遵循源站」。
没有这条规则时，升级 `@vivari/core` 后，升级前 4 小时内用过 vivari 的浏览器可能拿到旧打包件。
升级 `@vivari/core` 或改宿主代码后要重新部署宿主。

验证：发布前跑 `verify-pages-routing`（上节）；部署后 `curl -sI https://vscode-vivari.aiao.io/runtime-host.html` 应为 200
且带上述响应头，再在 vscode.aiao.io 的设置里选 vivari，跑 `verify-terminal --url=https://vscode.aiao.io/ --runtime=vivari`。

## 安全边界

- client secret 只存在于 Pages secret / `.dev.vars`，不进仓库、不进前端。
- 公开配置端点只返回 Client ID，并禁用缓存。
- `/redirect` 拒绝非同源或非 `/github-callback` 的 state，防开放重定向。
- token 端点提供公开 Client ID、「code → token」与「token 撤销」，不代理其他 API 流量；
  其余 GitHub 请求由浏览器直连 `api.github.com`（CORS 实测可用）。
