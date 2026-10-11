# US-602 B 实施计划

## 方案

B 使用本地 Docusaurus 插件的 `postBuild` 生命周期生成 `llms.txt` 与 `llms-full.txt`，不引入第三方 llms 插件。生成器复用 A1 的 `package-knowledge` 构建逻辑，因此包范围、版本、事实摘要、安装清单和样例不会再复制一份规则。

- 站点域名只从 `website/docusaurus.config.ts` 的 `url` 读取；包 manifest 中的旧域名首页只保留 pathname，重新拼到当前站点域名上。
- `llms.txt` 只为最近可达 `v*` 标签中的包生成安装命令，并显式列出当前工作树中未进入该标签的包，但不给安装命令。
- `llms-full.txt` 拼接 `website/docs/` 下的 Markdown / MDX 文档，包括 API 文档生成步骤产生的内容，并保留代码块。
- UTF-8 字节上限固定为：`llms.txt` 128 KiB、`llms-full.txt` 12 MiB。超限直接失败，不截断。
- Netlify 为两个文件固定 `Content-Type: text/plain; charset=utf-8`。生产域名 smoke 需要部署后执行，当前 PR 只验证构建产物与 deploy preview。

## 关闭条件

AC#9 与 AC#16 在本地 `pnpm nx build website` 通过后关闭；AC#10 等合入部署到 `https://docs.aiao.io` 后再做线上 smoke，并保留为 B 的剩余验收项。
