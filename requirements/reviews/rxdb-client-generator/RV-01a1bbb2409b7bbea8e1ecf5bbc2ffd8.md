---
id: 'RV-01a1bbb2409b7bbea8e1ecf5bbc2ffd8'
title: 'CLI 配置文档仍称 TreeRepository 内置，误导用户省略必需生成器'
project: 'rxdb-client-generator'
branch: 'refs/heads/codex/full-review-main-20261108'
range: 'project'
base_ref: null
review_scopes: []
scope_id: 'project:rxdb-client-generator'
status: 'Open'
severity: 'P3'
source_view: 'commit'
source_snapshot: '0ffa3c419fcc59dc3e13d695ca4658116134bfa0'
base_sha: null
found_branch: 'refs/heads/codex/full-review-main-20261108'
found_snapshot: '0ffa3c419fcc59dc3e13d695ca4658116134bfa0'
found_range: 'project'
created: '2026-11-08'
updated: '2026-11-08'
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
