---
name: 'affected-ci'
description: '对当前分支变更跑 nx affected 校验。封装 lint/test/build/e2e 组合，三档可选：quick(lint+test)、full(即 pnpm test-all)、coverage(test --coverage)。触发场景：用户说「跑 CI」「affected 跑一下」「lint 测一遍」「准备提 PR 之前」「这次改动会不会挂」「commit 前验证」。'
argument-hint: 'quick | full | coverage | typecheck（默认 full）。可附 --base=<ref> 覆盖基线分支。'
user-invocable: true
disable-model-invocation: false
---

## User Input

```text
$ARGUMENTS
```

## nx affected 验证

把 `pnpm test-all` 一系列长命令封成可挑模式的入口。所有命令通过 `pnpm nx`，**禁止**绕过缓存（`--skipNxCache`）除非用户明确要求。

### 模式映射

| 模式 | 命令 | 用途 |
| --- | --- | --- |
| `quick` | `pnpm nx affected -t lint test --parallel=4 --nxBail` | TDD 循环中快速反馈 |
| `full`（默认） | `pnpm test-all` | 仓库全量门禁本身（target 集合、并行度与缓存策略只认 `package.json#test-all`），PR 前必跑 |
| `coverage` | `pnpm nx affected -t test --coverage --parallel=4` | 覆盖率回归（`--coverage` 原样转给 vitest） |
| `typecheck` | `pnpm nx affected -t typecheck --parallel=4` | 仅 TS 编译校验 |

`full` 不再另抄一条 nx 命令：抄出来的副本曾漏掉 `test-memory` / `audit-lazy-backend`、多排除了 `website` / `benchmarks`，
两份 skill 各自漂移，full 跑绿不代表全量门禁绿。用户给了 `--base=<ref>` 就写成 `pnpm test-all --base=<ref>`（pnpm 把参数追加到脚本末尾）。

### 执行步骤

1. **先看影响范围**

   ```bash
   pnpm nx show projects --affected --base=<base>
   ```

   - 默认 `--base` 取 `main`（参见 nx.json 或 git 默认）
   - 如果用户传了 `--base=<ref>` 参数，透传过去
   - 如果**零项目受影响**，直接报告并退出，不要空跑

2. **报告即将执行的命令**（让用户确认范围）

   ```
   模式：full
   受影响项目（N 个）：rxdb, rxdb-angular, dev-rxdb-angular, ...
   即将执行：pnpm test-all
   ```

3. **执行**：直接跑命令，不要拆步骤（nx 自带并行调度）

4. **解析结果**
   - 全绿：报告「N 个项目通过」+ 耗时
   - 有失败：列出失败的 `<project>:<target>`，引用日志关键行；按 lint → typecheck → test → build → e2e 的顺序排查（前者是后者的前提）
   - 缓存命中比例（从 nx 输出末尾提取，体现增量价值）

5. **下一步建议**（按失败类型）
   - lint 红：`pnpm nx run <project>:lint --fix`
   - typecheck 红：定位首个 TS 错误文件，建议 Read 后修
   - test 红：`pnpm nx test <project> --watch` 进 TDD 循环
   - build 红：通常是依赖未先 build 或 tsconfig 问题
   - e2e 红：先 `pnpm nx serve <app>` 本地复现

### 不要做的事

- **不要**用 `--skipNxCache`、`--no-cloud` 绕过缓存（缓存是 Nx 设计的一部分）
- **不要**用 `--no-verify` 之类的钩子绕行
- **不要**把 `--parallel` 调高于 4（与 `pnpm test-all` 一致；本机 32GB 上 4 已会把 vitest forks 和 Angular 构建打崩，假失败先串行复跑，见 AGENTS.md「全量测试坑」）
- **不要**给 full 另加 `--exclude` 或删减 target：全量的口径只有 `package.json#test-all` 一处
- **不要**在 `affected` 之外手动指定 `--projects`，那是 `run-many` 的用法
- 失败时**不要**自动重跑指望偶发能通过；定位根因再说
