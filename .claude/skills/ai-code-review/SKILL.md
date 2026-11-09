---
name: ai-code-review
description: 本仓库的持久化代码评审：按项目或分支做全量或增量评审，问题写进 requirements/reviews，可按 ID 修复、复核或提异议，不同模型能接着做。只在用户点名本 skill，或明确要求持久化 / 增量评审、处理已有 RV 问题时使用；普通看 PR、评审文档不用它。
argument-hint: 'incremental | full | fix --issue=RV-<id> | verify --issue=RV-<id> | dispute --issue=RV-<id>；可加 --project / --branch / --range / --base / --worktree / --independent'
user-invocable: true
disable-model-invocation: true
---

正文与 Codex 共用：先完整读 [.agents/skills/ai-code-review/SKILL.md](../../../.agents/skills/ai-code-review/SKILL.md)，再按它的路由读 references，照它执行。本文件只是 Claude Code 的入口，规则不在这里重复。

## User Input

```text
$ARGUMENTS
```
