---
id: RV-01a21194e6dd7d14907c32bfdb6571d2
title: '核心 4 个新导出不符命名门禁，api-surface 例外清单自查自放未见裁决'
project: 'rxdb'
status: Open
severity: 'P2'
anchors: ['scripts/audit/api-surface.mjs#corePrefixExceptions']
affected_projects: []
related_findings: []
found_on_branch: 'refs/heads/supabase-log-access-baseline'
found_view: commit
found_snapshot: 'b739b164a7dec9093c2e27c124563fd99a250400'
found_range: project
found_base: null
created: 2026-11-25
updated: 2026-11-25
pr: null
---

# RV-01a21194e6dd7d14907c32bfdb6571d2：核心 4 个新导出不符命名门禁，api-surface 例外清单自查自放未见裁决

## 问题与影响

门禁要求核心导出以 `Commit*` / `WorkingTree*` / `Worktree*` 前缀（`api-surface.mjs:320` 的 `corePrefixes`）；
本分支新增的 4 个核心导出 `RxDBIdentity`、`RXDB_ANONYMOUS_SUBJECT`、`getRxDBIdentityDatabaseName`、`RxDBIdentityMismatchError`
不满足前缀，由同一个 PR 在 `corePrefixExceptions` 逐名豁免（附 US-035 理由注释），`main` 上没有这 4 个名字。
形态是「自查自放」：每个 PR 都能给自己扩例外，命名门禁对核心导出失去约束力；后续提交 b1fa00d1 又补登了 3 个 US-226 名字，
说明例外清单在持续增长。

定 P2：仓库铁律相关但无行为后果；裁决口径属于 owner（改名成本 vs 豁免常态化），2026-11-23 评审即标注「需用户裁决口径」，HEAD 上未见裁决。

## 证据与根因

快照 `b739b164a7dec9093c2e27c124563fd99a250400`：

- `scripts/audit/api-surface.mjs:320`：`corePrefixes` 仍为 `['Commit','WorkingTree','Worktree']`。
- `scripts/audit/api-surface.mjs:566-573`：`corePrefixExceptions` 含 `'RxDBIdentity'`、`'RXDB_ANONYMOUS_SUBJECT'`、`'getRxDBIdentityDatabaseName'`、`'RxDBIdentityMismatchError'`，附「US-035 本地库与身份的绑定」理由注释。
- `scripts/audit/api-surface.mjs:612-632`：`auditNaming` 仍按前缀 + 逐名例外判定。
- `git show main:scripts/audit/api-surface.mjs`：无这 4 个名字，例外确由本分支扩写。

## 修复方向

owner 裁决二选一：4 个名字改名满足前缀门禁（如 `getRxDBIdentityDatabaseName` → `getRxDBWorktreeDatabaseName` 一类，或保留 `RxDBIdentity` 仅豁免类型名）；
或正式放宽核心命名门禁，把豁免规则与理由写进 AGENTS.md 门禁条款，杜绝逐 PR 扩例外。裁决前保持例外登记。

## 处理记录

### EV-01a211955ec67885a632e43c577ce6ee：发现

- 时间：2026-11-25T15:19:59+0800
- 操作：review/independent
- 执行者：ai；anthropic/claude-fable-5；会话 5812bc94-4aee-477d-b7b0-036b9c8fbed8
- 输入快照：`b739b164a7dec9093c2e27c124563fd99a250400`
- 输出快照：同输入
- 状态：未登记 → Open
- 结论：成立。例外由本分支扩写、理由注释存在，但「是否应当豁免」未见 owner 裁决，门禁自查自放的形态未变。
- 验证：4 个独立验证 agent 在 HEAD 上对抗性核对（工作流 wf_fbd47c66-d14），主会话对 `api-surface.mjs:320、566-573` 做行级复核，并核对 `main` 版本无此 4 名；未运行测试，结论基于静态证据。
- 剩余事项：owner 裁决改名或放宽门禁。

### EV-01a211cfe27c7572bd645734c3098125：复核（方案层，2026-11-25 批次 8/9 授权后）

- 时间：2026-11-25T16:26:06+0800
- 操作：review/independent
- 执行者：ai；anthropic/claude-fable-5；会话 5812bc94-4aee-477d-b7b0-036b9c8fbed8
- 输入快照：`0c53cb30dc05a53483e1a5f8a9f647d82f4029d7`
- 输出快照：同输入（只写评审记录）
- 状态：Open（不变）
- 结论：裁决仍未出现。且 2026-11-25 更新版的 US-038 计划从 index.ts 新导出 `RxDBForeignKeyCycleError`（`US-038:138`），
  同样不满足 `corePrefixes` 前缀门禁——若沿用现状，`corePrefixExceptions` 将再扩一员，「自查自放」形态延续，且故事未提及门禁影响。
- 验证：文档评审工作流 wf_9f752545-f43（3 读者 + 1 评审）交叉核对，主会话复核 US-038 技术笔记与 `api-surface.mjs` 例外清单；未运行测试，结论基于静态证据。
- 剩余事项：owner 裁决改名或放宽门禁；US-038 落地前先定新导出的门禁处置。
