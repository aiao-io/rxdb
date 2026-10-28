# PR #139：公共包提取待评审

代码问题 B-01～B-07 已修复，永久回归覆盖完整集合、详情保存身份、模态焦点、筛选转义、备份 Promise、读取就绪与 React 首帧动作。干净提取树四包 353 项测试、lint/typecheck、API 与构建入口检查通过。

当前剩余 G-01：公共包提取 [PR #171](https://github.com/aiao-io/rxdb/pull/171) 等待独立评审。依据 [AGENTS.md](../../AGENTS.md)「packages 改动先提取、评审、单独合入 main，再从 main 合回」，该 PR 合入 main 后，本领域分支需再合回 main，之后才能继续领域合并流程。

本记录保留这一项治理前置；完成后可以删除。
