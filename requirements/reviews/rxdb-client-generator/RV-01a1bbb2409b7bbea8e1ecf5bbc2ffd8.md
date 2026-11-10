---
id: 'RV-01a1bbb2409b7bbea8e1ecf5bbc2ffd8'
title: 'CLI 配置文档仍称 TreeRepository 内置，误导用户省略必需生成器'
project: 'rxdb-client-generator'
branch: 'refs/heads/codex/full-review-main-20261108'
range: 'project'
base_ref: null
review_scopes: []
scope_id: 'project:rxdb-client-generator'
status: 'Resolved'
severity: 'P3'
source_view: 'commit'
source_snapshot: '0ffa3c419fcc59dc3e13d695ca4658116134bfa0'
base_sha: null
found_branch: 'refs/heads/codex/full-review-main-20261108'
found_snapshot: '0ffa3c419fcc59dc3e13d695ca4658116134bfa0'
found_range: 'project'
created: '2026-11-08'
updated: '2026-11-10'
anchors:
  ['packages/rxdb-client-generator/src/cli/cli.interface.ts#RxDBClientCLIentGeneratorOptions.repositoryGenerators']
affected_projects: []
related_findings: []
pr: null
---

# RV-01a1bbb2409b7bbea8e1ecf5bbc2ffd8：CLI 配置文档仍称 TreeRepository 内置，误导用户省略必需生成器

## 问题与影响

阅读 repositoryGenerators 的公共 TSDoc 配置树实体时，用户被告知 TreeRepository 自动注册，可以省略插件生成器；实际仅内置 Repository，树实体需要显式装载 TreeRepositoryGenerator。照文档配置将触发缺失生成器/抽象元数据错误。属有具体配置后果的文档不一致，记 P3。

## 证据与根因

证据快照：`0ffa3c419fcc59dc3e13d695ca4658116134bfa0`。

`packages/rxdb-client-generator/src/cli/cli.interface.ts:29` 声称 Repository / TreeRepository 自动注册。`packages/rxdb-client-generator/src/core/RxDBClientGenerator.ts:261` 附近构造器只注册 RepositoryMethodsGenerator；`packages/rxdb-client-generator/src/core/known-repository-generators.ts:18` 把树插件映射为必须放入 repositoryGenerators 的规格。其余同字段后续文档已描述外置插件装载，首句仍保留旧契约。

## 修复方向

更新公共类型 TSDoc 的内置目录与树/图示例，保持构造器、提示表和 README 一致。

## 处理记录

### EV-01a1bbb240c7782298948a1f6be2fd4d：发现

- 时间：2026-11-08T23:06:23+08:00
- 操作：review/full
- 执行者：ai；provider、model、version、session 均为 unknown
- 输入快照：`0ffa3c419fcc59dc3e13d695ca4658116134bfa0`
- 输出快照：`0ffa3c419fcc59dc3e13d695ca4658116134bfa0`（仅写评审记录）
- 状态：未登记 → Open
- 结论：CLI 配置文档仍称 TreeRepository 内置，误导用户省略必需生成器。
- 验证：完整读公共类型、构造器、已知生成器提示表与插件装载测试，静态确认内置注册表；未执行额外构建。
- 剩余事项：按 fix 处理并补对应回归，再 verify。

### EV-01a1c16b1ae37c8c8c12d85e5c23381d：修复

- 时间：2026-11-10T01:46:24+08:00
- 操作：fix
- 执行者：ai；anthropic/claude-opus-5-5；会话 aa117580-681a-4540-85b2-3c61967b2092（Claude Code 并行子 agent G10）
- 输入快照：`1b5fb4e43f449bace1d6f67df78e55a129863f50`（提交视图）
- 输出快照：工作区树 `a02c6ca2a98872de5c7970487ef5051708ceb3bc`（`ai-review snapshot --worktree`，基于 `62cc9a51`（外部自动提交，含各组 WIP））
- 状态：Open → Fixed
- 结论：成立，P3 维持。构造器只注册 `RepositoryMethodsGenerator`，`TreeRepository` 早已外置到插件包（`known-repository-generators.ts` 的提示表），公开类型的 TSDoc 首句仍写「内置的 Repository / TreeRepository 自动注册」，照它配置树实体会在生成时报缺少生成器。行为本身不改。
- 改动：`packages/rxdb-client-generator/src/cli/cli.interface.ts:29` 改为「只内置普通实体的 Repository；树、图等扩展生成器由插件包提供，用到 @TreeEntity / @GraphEntity 就必须显式装载」，示例同时列出 tree 与 graph 两条规格。README 与 `website/docs/client-generator.md` 未提 `repositoryGenerators`，无需同步。
- 验证：「树生成器不内置、缺失时报出该写的规格」由现有 `packages/rxdb-client-generator/src/__tests__/known_repository_generators.spec.ts:25` 锁住，与 `api-docs.spec.ts`（导出均有 TSDoc）合跑 8/8；eslint 通过。纯 TSDoc 文案没有可执行的回归：拿测试去匹配注释措辞只会把文案钉死，不加。
- 剩余事项：无。

### EV-01a1c178a0457df4acf780ee9e214c90：复核

- 时间：2026-11-10T02:01:10+08:00
- 操作：verify
- 执行者：ai；anthropic/claude-opus-5-5；会话 aa117580-681a-4540-85b2-3c61967b2092（Claude Code 并行子 agent G10，复核角色）
- 输入快照：工作区树 `a02c6ca2a98872de5c7970487ef5051708ceb3bc`（上一 fix 事件的输出快照）
- 输出快照：工作区树 `f578406797ca9db6abb8c41c4fa50686c3cf9238`（`ai-review snapshot --worktree`，基于 `62cc9a51`（外部自动提交，含各组 WIP））
- 状态：Fixed → Resolved
- 结论：TSDoc 与构造器（只注册 `RepositoryMethodsGenerator`）、提示表（树 / 图规格）一致，示例同时给出 tree 与 graph 两条规格；包内 README 与网站 `client-generator.md` 不涉及该字段，无冲突表述。
- 验证：整包 42 个文件 423 条全绿（含 `api-docs.spec.ts` 与 `known_repository_generators.spec.ts`）；`pnpm nx lint rxdb-client-generator --exclude-task-dependencies --skip-nx-cache` 通过。
- 剩余事项：无。
