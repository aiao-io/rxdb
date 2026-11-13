---
id: ADESK-US-003
title: 一键发布到 Cloudflare Pages
status: Done
priority: High
epic: ADESK-EPIC-001
created: 2026-11-13
updated: 2026-11-13
tags: [tooling, deploy, cloudflare, nx]
dependsOn: [ADESK-US-001]
capabilities: []
---

# 用户故事：一键发布到 Cloudflare Pages

## 作为/我想要/以便

**作为** Aiao Desktop 的维护者
**我想要** 用一条 `pnpm nx run aiao-desktop:deploy` 把桌面的正式构建发布到 Cloudflare Pages，并自动确认线上跑的就是刚构建的这一份
**以便** 不用记 wrangler 的参数与坑（项目首次创建、分支、响应头），也不会在发布后才发现线上缺了终端需要的跨源隔离。

## 范围边界

### In Scope

- 托管（[D-16](../../decisions.md#d-16发布到-cloudflare-pages一键发布命令)）：Cloudflare Pages 项目 `aiao-desktop`，生产分支 `main`，生产地址 `https://aiao-desktop.pages.dev`；纯静态，没有 Functions，不带密钥。
- 随构建发布的托管配置：`apps/web/public/_headers`（全站 COOP / COEP，[D-05](../../decisions.md#d-05终端依赖跨源隔离)）与 `_redirects`（`/saltline.html` 200 改写，[D-15](../../decisions.md#d-15随桌面发布的单文件游戏在同源-iframe-里运行)）。
- 一键命令 `aiao-desktop:deploy`：依赖正式构建与密钥扫描，然后检查产物、首次发布时新建项目、上传、线上对账；`--dry-run` 只检查，`--preview` 发到 Preview 分支。
- 线上对账：部署地址逐文件比字节并检查每个响应的 COOP / COEP；生产地址与项目已绑定的自定义域名核对入口页；新项目的子域名证书未就绪时等待。
- 发布前读出上一版生产部署，结尾打印作为回滚点。
- 发布后的浏览器级验收：`aiao-desktop-e2e:verify-aiao-code` 新增 `--desktop-url`，直接验收已发布的桌面。

### Out of Scope

- CI 自动发布：CI 里没有 Cloudflare 凭据；发布者用本机的 wrangler 登录。要上 CI 时另立故事（wrangler 认 `CLOUDFLARE_API_TOKEN` 与 `CLOUDFLARE_ACCOUNT_ID`，脚本本身不用改）。
- 绑定自定义域名：Pages 没有对应的 CLI，由用户在面板的 Custom domains 里操作；绑定后下一次发布自动核对它。
- 自动回滚：只打印回滚点，回滚在 Pages 面板的部署页操作。
- 发布前重跑浏览器冒烟：完整门禁是 `aiao-desktop:verify`，命令只守住托管相关的失败（[D-16](../../decisions.md#d-16发布到-cloudflare-pages一键发布命令) 第 5 条）。

## 验收标准

| #   | 前置条件                                                                | 操作                                                         | 预期结果                                                                                                                                 | 状态 |
| --- | ----------------------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | web 的正式构建                                                          | 查看 `dist/aiao-desktop/apps/web/browser`                    | 根目录有 `_headers`（`/*` 规则里 COOP `same-origin`、COEP `require-corp` 各恰好一次）与 `_redirects`（`/saltline.html` 200 改写）        | ✅   |
| 2   | 产物缺 `index.html` 或 `_headers`，或响应头缺失、取值不对、同名写了多次 | 运行 `aiao-desktop:deploy`                                   | 在执行任何 wrangler 命令之前失败，逐条说明原因                                                                                           | ✅   |
| 3   | 产物合格                                                                | `pnpm nx run aiao-desktop:deploy --dry-run`                  | 先构建与密钥扫描，再检查产物，打印将执行的 wrangler 命令；不新建项目、不上传                                                             | ✅   |
| 4   | Cloudflare 账号里没有 `aiao-desktop` 项目，本机 wrangler 已登录         | 运行 `aiao-desktop:deploy`                                   | 新建经典 Pages 项目（生产分支 `main`），上传产物，`https://aiao-desktop.pages.dev` 返回桌面                                              | ✅   |
| 5   | 项目已存在                                                              | 再次运行 `aiao-desktop:deploy`                               | 不新建项目；日志打印上一版生产部署编号（回滚点）；已上传过的文件不重复上传；发布到 `main`                                                | ✅   |
| 6   | 刚完成上传                                                              | （命令自动执行）                                             | 部署地址上每个文件与本地产物逐字节一致且都带 COOP / COEP；生产地址与自定义域名的入口页一致；任何一项不符，命令以非零退出并列出文件与原因 | ✅   |
| 7   | 新项目首次发布，`*.aiao-desktop.pages.dev` 的证书还没签发               | 运行 `aiao-desktop:deploy`                                   | 提示正在等待并重试，连上后继续核对；超过时限则把该地址记为失败，其余地址照常核对                                                         | ✅   |
| 8   | 项目已存在                                                              | `pnpm nx run aiao-desktop:deploy --preview`                  | 发布到 Preview 分支，别名 `https://preview.aiao-desktop.pages.dev` 通过核对；生产部署不变                                                | ✅   |
| 9   | 命令行里有未知参数                                                      | 例如 `aiao-desktop:deploy --prod`                            | 立即失败并给出用法，不发布（拼错 `--preview` 时不会悄悄发到生产）                                                                        | ✅   |
| 10  | 已发布，本机能访问外网                                                  | `aiao-desktop-e2e:verify-aiao-code --desktop-url=<线上地址>` | 线上桌面加线上 Aiao Code 的验收项全过（跨源隔离、终端、透明窗口拖动与缩放、最小化还原、关闭重开；项数以脚本输出为准），桌面没有页面错误  | ✅   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

验收证据：#1 是 [config.spec.mjs](../../../scripts/deploy/config.spec.mjs)（随构建发布的 `_headers` 与发布配置一致）与 [dist-check.spec.mjs](../../../scripts/deploy/dist-check.spec.mjs)，托管语义另用 `wrangler pages dev`（与线上同一份资源服务代码）实测：`/saltline.html` 改写后 200、`/index.html` 308 到 `/`、`.wasm` 为 `application/wasm`。#2、#3、#9 是 dist-check.spec 与 [deploy.spec.mjs](../../../scripts/deploy/deploy.spec.mjs)（`aiao-desktop:deploy-test`，随产品根的 `test` 进 CI），#3 另在本机实跑。#4～#8 的流程由 deploy.spec 与 [live-check.spec.mjs](../../../scripts/deploy/live-check.spec.mjs) 用替身覆盖，并在本机对真实的 Cloudflare 账号实跑，记录见[验收台账](../../verification-report.md#发布)。#10 是 [verify-aiao-code.mjs](../../../apps/e2e/src/verify-aiao-code.mjs) 对线上的实跑。

## 技术笔记

- 命令分工：Nx 的 `deploy` 目标依赖 `aiao-desktop-web:build` 与 `audit-secrets`（两者命中缓存时几乎不花时间），然后跑 `scripts/deploy/deploy.mjs`。脚本的外部依赖（wrangler、产物检查、线上对账、Git、日志）都从 `runDeploy(options, deps)` 注入，测试用替身走完整流程。
- wrangler 的用法（4.158.0，经 `pnpm dlx`）：`pages project list --json` 判断项目是否存在，不存在时 `pages project create … --force`（这个版本不带 `--force` 会转给 Workers 版 Pages 并失败）；`pages deployment list --environment production --json` 取上一版；`pages deploy <产物目录> --project-name … --branch … --commit-dirty=…`，部署地址与编号从 `WRANGLER_OUTPUT_FILE_PATH` 的结构化输出里取（`pages-deploy-detailed` 记录），不解析人读日志。提交哈希与说明由 wrangler 从工作目录的 Git 读取，所以 wrangler 的工作目录选在仓库内（`aiao-desktop/`，那里没有 wrangler 配置文件）。
- 命令给 wrangler 子进程补上 `--dns-result-order=ipv6first`（`deploy.mjs` 的 `wranglerEnv`）：本机直连 Cloudflare 的 IPv4 地址时 OAuth 刷新会超时并误报未登录。
- 首次发布实测到的两点：新项目的部署地址 `<编号>.aiao-desktop.pages.dev` 在证书签发前是 TLS 握手失败（`ERR_SSL_SSL/TLS_ALERT_HANDSHAKE_FAILURE`），而 `aiao-desktop.pages.dev` 立即可用，所以对账前先等地址连得上；Pages 对不存在的路径回 `index.html` 且 200，所以对账比字节而不是看状态码。
- 对账请求用 `redirect: 'manual'`：`index.html` 对应站点根（`/index.html` 会被 308 到 `/`），其余文件必须直接 200，所以 `_redirects` 的改写失效也会被发现。`_headers` 与 `_redirects` 由 Pages 自己消费，不作为站点内容请求。

## 实现文件

- `aiao-desktop/apps/web/public/_headers`、`_redirects` — 随构建发布的托管配置。
- `aiao-desktop/scripts/deploy/config.mjs` — 项目名、分支、wrangler 版本、产物目录与必需响应头。
- `aiao-desktop/scripts/deploy/dist-check.mjs` — 发布前的产物检查与 `_headers` 解析。
- `aiao-desktop/scripts/deploy/live-check.mjs` — 线上逐文件对账与等待地址连通。
- `aiao-desktop/scripts/deploy/deploy.mjs` — 命令入口与发布流程。
- `aiao-desktop/project.json` — `deploy`、`deploy-test` 目标；`test`、`verify` 包含 `deploy-test`。
- `aiao-desktop/apps/e2e/src/verify-aiao-code.mjs` — `--desktop-url`。

## References

- [D-16](../../decisions.md#d-16发布到-cloudflare-pages一键发布命令)
- [ADESK-EPIC-001](../../epics/ADESK-EPIC-001.md)
- aiao-vscode 的 Cloudflare Pages 部署：[apps/aiao-vscode/deploy/README.md](../../../../apps/aiao-vscode/deploy/README.md)
- Cloudflare Pages 的 `_headers` 与 `_redirects`：<https://developers.cloudflare.com/pages/configuration/headers/>、<https://developers.cloudflare.com/pages/configuration/redirects/>
