# `website` 代码评审

## 结论

🔴 不通过。预览服务器存在可直接复现的目录穿越，能读取 `build` 目录之外的仓库文件；文档站又被主 CI 排除，并主动把断链和 TypeDoc 错误降级，发布门禁形同虚设。

## 评审基线

- 基线提交：`03a46a5d5992a958c19ae33d5fed15c9c3322021`
- 评审日期：2026-07-14
- 范围：`website` 下预览/构建脚本、Docusaurus 与 TypeDoc 配置、站点源码和 Nx 配置
- 自动校验：本轮仅执行静态只读审查和漏洞路径交叉验证，未单独运行 `website` 的 Nx 任务
- 测试现状：项目没有 `test` target；根 `test-all` 明确排除 `website`

## 问题

| ID | 级别 | 位置 | 问题与影响 | 建议 |
| --- | --- | --- | --- | --- |
| WEBSITE-001 | P1 | `scripts/preview-with-redirects.mjs:73` | 请求路径先 `decodeURIComponent()`，随后直接传给 `join(buildDir, requestPath)`，没有做根目录约束。请求 `/%2e%2e%2f%2e%2e%2fpackage.json` 会解码为 `/../../package.json` 并逃出 `build`，返回仓库根文件。服务器又以 `server.listen(PORT)` 监听未限定主机，预览一旦暴露在局域网或容器端口上，就成为任意文件读取入口。 | 使用 URL 路径规范化后基于 `resolve()` 生成候选路径，再用 `relative()`/根前缀校验确保结果仍在 `buildDir`；拒绝绝对路径、`..`、编码分隔符和 NUL。默认显式监听 `127.0.0.1`，为穿越 payload 增加回归测试。 |
| WEBSITE-002 | P1 | `../package.json:19`、`project.json` | 主 `test-all` 固定 `--exclude=website,benchmarks`，而 website 自身没有测试 target。预览服务器、构建脚本、重定向解析和文档配置全部绕过主 CI，本次目录穿越因此可以长期存在。 | 为脚本和配置增加单元/集成测试 target，将 `website` 纳入主 CI；需要外部环境的步骤可以拆 target，不能整体排除。 |
| WEBSITE-003 | P2 | `docusaurus.config.ts:33` | `onBrokenLinks` 和 `onBrokenAnchors` 都设为 `warn`。文档路由、锚点或 API 链接失效时构建仍成功，用户只能在发布后遇到坏链接。 | CI/生产构建使用 `throw`；如果 demo 复制顺序导致少量已知路径特殊，修正构建依赖或对生成物做精确校验，不要全局降级。 |
| WEBSITE-004 | P2 | `typedoc.config.cjs:18`、`typedoc.config.cjs:118` | TypeDoc 入口仍引用不存在的 `packages/rxdb-plugin-trigger`，同时 `skipErrorChecking: true` 跳过错误检查。配置已经过期，却会继续生成看似成功但缺失或错误的 API 文档。 | 删除失效入口或恢复项目；启用错误检查，并在 CI 中验证所有入口真实存在、TypeDoc 生成无错误。 |

## 其余观察 / 测试缺口

- `preview-with-redirects.mjs` 对无效 URI 编码、目录穿越、重定向目标越界和端口参数都没有测试。
- `lint` 只覆盖 `website/src`，不覆盖 `scripts/`、Docusaurus 和 TypeDoc 配置，风险最高的代码正好在门禁外。
- 全局把断链降级为 warning 会掩盖真实内容回归，不是可维护的发布策略。

## 验收条件

- 穿越 payload 及其双重编码、反斜杠、绝对路径变体全部返回 4xx，任何静态文件读取结果都被约束在 `website/build` 内。
- 预览服务器默认只监听 loopback；显式对外监听必须由参数选择。
- `website` 加入主 CI，并通过 lint、脚本测试、文档构建和链接/API 文档完整性校验。
