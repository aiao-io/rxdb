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

PR 预览与现有 CI 并行构建，不需要等全仓检查结束。部署成功后，固定预览地址显示在 PR 的 GitHub deployment 环境和 Actions job summary 中；summary 同时保留本次提交的不可变部署地址。Pages 的实际项目子域来自 API，不能假定一定是 `rxdb.pages.dev`。

每次发布显式传入 `--branch`。PR 只更新自己的预览；关联正式域名的操作只在 main 上执行。Pages 会给预览响应加 `X-Robots-Tag: noindex`，站点 canonical URL 继续使用正式域名。

## 凭据与首次迁移

在 GitHub 仓库的 Actions secrets 中配置：

- `CLOUDFLARE_ACCOUNT_ID`：Cloudflare 账户 ID。
- `CLOUDFLARE_API_TOKEN`：在该账户具有 `Account > Cloudflare Pages > Edit` 权限的 API Token。

预览环境名称是 `pr-<编号>`，正式环境名称是 `production`。若只在 `production` environment 放 secrets，PR 无法使用它们；可用仓库 secrets，或者分别配置对应环境。

缺少凭据时，同仓库 PR 会完成构建和产物检查，并在 summary 标明未发布。fork 和 Dependabot PR 同样只构建，不读取部署凭据。正式发布缺少凭据会失败。

工作流会创建或复用名为 `rxdb` 的 Pages Direct Upload 项目，校验其 `production_branch` 为 `main`。正式发布后关联 `rxdb.aiao.io`，并打印域名验证状态。**域名关联不等于 DNS 已切换。** 首次迁移按以下顺序完成：

1. 停止旧 Netlify 项目的自动构建，移除 GitHub 分支保护中旧 Netlify required check。删除仓库的 `netlify.toml` 不会解绑 Netlify 控制台中的 Git 集成。
2. 配置上述 secrets，运行 PR 预览并检查三端 demo、搜索和文档。
3. 合入 main，等正式构建与 Pages 发布成功。
4. 在 `aiao.io` DNS 中把 `rxdb` 原来指向 Netlify 的记录改为 CNAME，目标使用 job summary 中打印的实际 `<项目子域>.pages.dev`。同名旧记录需替换。也可以在 Cloudflare Pages 的 Custom domains 页面确认 DNS 变更。
5. 等域名状态和证书生效，检查正式首页、`/docs/getting-started`、`/demos/react/todo`、`/llms.txt`。预览链接继续指向各自 PR。

CI token 只需要 Pages 权限；DNS 切换由域名管理界面完成。仓库已移除 Netlify 构建配置和插件，原有全站隔离头、安全头、LLM 文本类型与缓存规则统一放在 `website/public/_headers`。三端 demo 的 SPA 深链规则由 `_redirects` 管理。整站构建会复制三端入口到 `demo/<框架>.html`，并给实际 JS/WASM/SW 资源生成精确规则，避免 Pages 的 rewrite 优先级吞掉资源；深链目标使用无扩展名路径，避免 HTML 规范化重定向丢失当前路由。生成规则超过 Pages 的 2,000 条静态规则上限时，构建会失败。

## Pages 产物门禁

```bash
pnpm nx run website:pages-check
```

上传前检查首页、404、响应头、路由规则和三端 demo/benchmarks 入口，并校验 Pages 免费计划的 20,000 文件上限与单文件 25 MiB 上限。搜索索引通过已锁定的 `docusaurus-search-local` 补丁生成为 `.json.gz`；搜索 Worker 使用 `DecompressionStream` 解压，保留全文、排序和高亮所需的数据。本地预览也使用同一压缩索引，不依赖托管平台额外设置 `Content-Encoding`。
