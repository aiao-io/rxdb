# Website

以下命令从仓库根目录执行。

## 本地开发与构建

```bash
pnpm install
pnpm nx serve website
pnpm nx build website
pnpm nx run website:preview
```

完整构建包含三端 demo、benchmarks、TypeDoc API 文档和 Docusaurus，产物位于 `website/build`。

## Cloudflare Pages 发布

`.github/workflows/website.yml` 被 PR 与 main 工作流共用：

| 触发                                 | Pages branch   | 地址与行为                                                              |
| ------------------------------------ | -------------- | ----------------------------------------------------------------------- |
| PR 创建、重新打开、更新提交          | `pr-<PR 编号>` | `https://pr-<PR 编号>.<项目子域>.pages.dev`，同一个 PR 始终更新同一地址 |
| main 推送或在 main 手动运行 workflow | `main`         | 完整 CI 通过后发布到 `https://rxdb.aiao.io`                             |

PR 预览与现有 CI 并行构建，不需要等全仓检查结束。部署成功后，机器人会在 PR 中创建或更新同一条预览评论，包含固定地址、本次部署快照、head SHA 与 Actions 日志；Actions job summary 也会记录地址。写评论的权限仅授予独立的 PR 评论 job。Pages 的实际项目子域来自 API，不能假定一定是 `rxdb.pages.dev`。

每次发布显式传入 `--branch`。PR 只更新自己的预览；关联正式域名的操作只在 main 上执行。Pages 会给预览响应加 `X-Robots-Tag: noindex`，站点 canonical URL 继续使用正式域名。

## 凭据与首次迁移

在 GitHub 仓库的 Actions secrets 中配置：

- `CLOUDFLARE_ACCOUNT_ID`：Cloudflare 账户 ID。
- `CLOUDFLARE_API_TOKEN`：在该账户具有 `Account > Cloudflare Pages > Edit` 权限的 API Token。

凭据使用仓库级 Actions secrets。构建 job 不声明 GitHub environment，避免 fork / Dependabot 在开始构建前因创建 deployment 缺少权限而失败。部署只在凭据检查通过后执行；同仓库普通 PR 和 main 缺少凭据均明确失败。fork 和 Dependabot PR 仅构建、检查产物，不发布、不写预览评论。

同仓库分支作者视为可信维护者，可以修改工作流并接触仓库级部署凭据；当前方案不隔离恶意的同仓库 PR。API Token 应限制在托管此站点的账户，只授予 Pages Edit。若需要隔离同仓库作者，应改成默认分支上的受保护发布流程，由独立 runner 接收构建产物，并把凭据放入需要审批的 environment；单纯改 checkout ref 不能建立这个隔离。

工作流会创建或复用名为 `rxdb` 的 Pages Direct Upload 项目，校验其 `production_branch` 为 `main`。正式发布后关联 `rxdb.aiao.io`，并打印域名验证状态。**域名关联不等于 DNS 已切换。** 首次迁移按以下顺序完成：

1. 停止旧 Netlify 项目的自动构建，移除 GitHub 分支保护中旧 Netlify required check。删除仓库的 `netlify.toml` 不会解绑 Netlify 控制台中的 Git 集成。
2. 配置上述 secrets，运行 PR 预览并检查三端 demo、搜索和文档。
3. 合入 main，等正式构建与 Pages 发布成功。
4. 在 `aiao.io` DNS 中把 `rxdb` 原来指向 Netlify 的记录改为 CNAME，目标使用 job summary 中打印的实际 `<项目子域>.pages.dev`。同名旧记录需替换。也可以在 Cloudflare Pages 的 Custom domains 页面确认 DNS 变更。
5. 等域名状态和证书生效，检查正式首页、`/docs/getting-started`、`/demos/react/todo`、`/llms.txt`。预览链接继续指向各自 PR。

CI token 只需要 Pages 权限；DNS 切换由域名管理界面完成。仓库已移除 Netlify 构建配置和插件，原有全站隔离头、安全头、LLM 文本类型与缓存规则统一放在 `website/public/_headers`。三端 demo 的 SPA 深链规则由 `_redirects` 管理。整站构建会复制三端入口到 `demo/<框架>.html`，并给实际 JS/WASM/SW 资源生成精确规则，避免 Pages 的 rewrite 优先级吞掉资源；深链目标使用无扩展名路径，避免 HTML 规范化重定向丢失当前路由。生成规则超过 Pages 的 2,000 条静态规则上限时，构建会失败。

## 预览生命周期

- 每个 PR 的固定地址是 `pr-<编号>.<项目子域>.pages.dev`，每次成功部署后保留本次和上一次成功部署，其余该 PR 的历史部署会删除。失败的构建不影响上一次可用预览。
- PR 关闭或合并时，`website-preview-cleanup.yml` 先在该 `pr-<编号>` 分支发布一个极小的关闭提示页，再删除所有旧 preview 部署，并将原评论更新为「已清理」。固定地址只显示自定义 404，旧部署快照不再保留；重新打开 PR 会重新构建并恢复固定地址。
- Cloudflare 不允许删除分支最新部署，因此保留一个不含 JS/WASM/应用资源的关闭提示页；响应设置 `no-store` 与 `noindex`。清理只匹配 `environment=preview` 且分支完全相同的部署，不删除正式站、Pages 项目或其他 PR。Pages 静态预览无需独立常驻服务器；清理针对保留的部署与访问入口。
- 发布与清理使用同一个按 PR 分组的并发锁。发布前重新读取 PR 状态和 head SHA；清理前确认 PR 仍关闭。清理工作流使用 `pull_request_target: closed`，仅 checkout 默认分支，不能运行 PR head 中的清理代码。
- API 失败会让 job 报错，不伪装成清理成功。可重跑失败任务，或手动运行 **Website preview cleanup** 并填写 PR 编号；仍打开的 PR 会跳过清理。当前没有定时兜底清理，需留意失败通知。

**关闭事件的自动清理在此工作流合入默认分支后生效。** 合入前的历史关闭 PR 可通过手动入口补清理。发布后的历史部署裁剪与预览评论可直接在当前 PR 验证。

`website:build` 聚合了 demo、benchmarks、API 文档和站点构建，关闭该聚合 target 的缓存，避免遗漏根目录 patches 等输入导致整站误命中旧缓存；内部 Nx 构建任务继续使用各自的缓存。

## Pages 产物门禁

```bash
pnpm nx run website:pages-check
```

上传前检查首页、404、响应头、路由规则和三端 demo/benchmarks 入口，并校验 Pages 免费计划的 20,000 文件上限与单文件 25 MiB 上限。搜索索引通过已锁定的 `docusaurus-search-local` 补丁生成为 `.json.gz`；搜索 Worker 使用 `DecompressionStream` 解压，保留全文、排序和高亮所需的数据。本地预览也使用同一压缩索引，不依赖托管平台额外设置 `Content-Encoding`。
