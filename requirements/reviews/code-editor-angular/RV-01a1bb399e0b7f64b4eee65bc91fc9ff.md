---
id: RV-01a1bb399e0b7f64b4eee65bc91fc9ff
title: 'Angular 编辑器 README 将已不存在的命令式 setter 声明为仍可用的弃用 API'
project: code-editor-angular
branch: refs/heads/codex/full-review-main-20261108
range: project
base_ref: null
review_scopes: []
scope_id: 'project:code-editor-angular'
status: Resolved
severity: P2
source_view: commit
source_snapshot: '0ffa3c419fcc59dc3e13d695ca4658116134bfa0'
base_sha: null
found_branch: refs/heads/codex/full-review-main-20261108
found_snapshot: '0ffa3c419fcc59dc3e13d695ca4658116134bfa0'
found_range: project
created: 2026-11-08
updated: 2026-11-10
anchors:
  - 'packages/code-editor-angular/README.md'
affected_projects: []
related_findings: []
pr: null
---

# RV-01a1bb399e0b7f64b4eee65bc91fc9ff：Angular 编辑器 README 将已不存在的命令式 setter 声明为仍可用的弃用 API

## 问题与影响

README 告诉现有消费者 setValue、setTheme 等命令式 setter 已标记 deprecated、将在下一个主版本移除，隐含当前版本仍可继续调用。实际当前导出的 CodeEditor 类没有这些方法。按这一迁移说明保留原调用的用户会立即得到 TS2339；绕过类型检查则得到方法不是函数的运行时异常。问题是当前文档错误描述了可用公开面，不能据此判断移除动作是否应回滚，定为 P2。

## 证据与根因

证据快照：`0ffa3c419fcc59dc3e13d695ca4658116134bfa0`。

- `packages/code-editor-angular/README.md:158` 至第 161 行列出 setValue、setTheme、setReadonly、setEditable、setPlaceholder、setIndentUnit、setIndentWithTab、setLineWrapping、setHighlightWhitespace，并断言它们已标记 deprecated、将在下一个主版本移除。
- 完整类实现 `packages/code-editor-angular/src/code-editor.ts:100` 至第 642 行仅提供 view/host/focus/blur、CVA 方法、setExtensions 和 setLanguage 等方法，没有所列九个 setter，也没有继承任何提供这些方法的基类。现有对应配置均经 input()/ngOnChanges() 维护。
- `packages/code-editor-angular/src/index.ts:14` 直接导出该 CodeEditor；没有包装层补齐这些旧方法。

最小消费者路径：从公开包导入 CodeEditor，取得 viewChild 后调用 `editor().setValue('x')`。依据当前源码类型，该成员不存在；README 却把它描述成仍可用的弃用入口。

## 修复方向

把弃用说明更新为当前实际的移除/迁移状态，说明应该使用 value、theme 等输入；若版本政策要求保留兼容，则在独立 fix 中按政策处理并补契约测试。本次只记录已确定的文档与公开面矛盾，不推断兼容政策结论。

## 处理记录

### EV-01a1bb399e30722791613f17e3e36ea6：发现

- 时间：2026-11-08T20:55:11+08:00
- 操作：review/full
- 执行者：ai；provider、model、version、session 均为 unknown
- 输入快照：`0ffa3c419fcc59dc3e13d695ca4658116134bfa0`
- 输出快照：`0ffa3c419fcc59dc3e13d695ca4658116134bfa0`（仅写评审记录）
- 状态：未登记 → Open
- 结论：九个被承诺为弃用但仍可用的 setter 在当前完整公开类中不存在。
- 验证：完整阅读 README、CodeEditor 类与包入口，核对实际方法清单；未运行额外构建/类型检查，未声称运行时执行过该非法调用。
- 剩余事项：更正迁移文档并按真实版本政策确认是否需要兼容修复。

### EV-01a1c15cfc77765a975c3e9d60e56b8c：修复

- 时间：2026-11-10T01:30:59+08:00
- 操作：fix
- 执行者：ai；anthropic/claude-opus-5-5；会话 aa117580-681a-4540-85b2-3c61967b2092（Claude Code 并行子 agent G11）
- 输入快照：`1b5fb4e43f449bace1d6f67df78e55a129863f50`（提交视图）
- 输出快照：工作区树 `980db0185930ab864593c9c6940408b16f015434`（`ai-review snapshot --worktree`，基于 `d7a55a6d`（外部自动提交，含各组 WIP））
- 状态：Open → Fixed
- 结论：成立，且兼容问题不存在：已发布的 v0.0.24 / v0.0.26 / v0.0.28 三个标签上，`packages/code-editor-angular/src/code-editor.ts` 都没有 `setValue` / `setTheme` / `setReadonly` 等九个方法（逐个标签 `git show` 核对），README 的这段弃用说明自 `c47cf979`（init）起就与源码不符，没有任何版本真正提供过它们，所以无需按版本政策补兼容层，只需更正文档。按说明保留调用的用户得到 TS2339 / 运行时「不是函数」，P2 合适。
- 改动：`packages/code-editor-angular/README.md` 删去该段，改为说明除 `setExtensions` / `setLanguage` 与 handle 外不提供别的命令式 setter，文档内容、主题、占位符、只读、缩进、换行与空白高亮经同名输入配置，可编辑状态由 `disabled` 输入或表单禁用状态控制。
- 验证：`packages/code-editor-angular/src/__tests__/code-editor.spec.ts` 新增「README 列出的命令式 set* 方法在公开的 CodeEditor 上都真实存在」（从 README 提取反引号里的 `set*` 名字，逐个核对 `CodeEditor.prototype`，并要求 `setExtensions` / `setLanguage` 仍在文档里）。修复前在 `packages/code-editor-angular` 跑 `npx vitest run --coverage.enabled=false src/__tests__/code-editor.spec.ts -t README` → 1 failed（`expected [ 'setValue', 'setTheme', …(7) ] to deeply equal []`）；修复后该文件 74 passed；`eslint . --max-warnings=0`、`tsc -p tsconfig.lib.json --noEmit`、`tsc -p tsconfig.spec.json --noEmit` 通过，README 过 prettier。React / Vue 的 README 与网站文档没有同类说明（grep 核对）。
- 剩余事项：本组收尾复核。

### EV-01a1c17136807f7ead2a8a4ccd889c2d：复核

- 时间：2026-11-10T01:53:04+08:00
- 操作：verify
- 执行者：ai；anthropic/claude-opus-5-5；会话 aa117580-681a-4540-85b2-3c61967b2092（Claude Code 并行子 agent G11，复核角色）
- 输入快照：工作区树 `980db0185930ab864593c9c6940408b16f015434`
- 输出快照：工作区树 `2aaec263c41eba83ea2704af1e413c70a270c8eb`（`ai-review snapshot --worktree`，基于 `62cc9a51`（外部自动提交，含各组 WIP））
- 状态：Fixed → Resolved
- 结论：README 不再承诺不存在的 setter，列出的 `set*` 方法与公开类一致，新增用例会在今后任何一次文档 / 源码漂移时变红；配置方式指向已有的 Inputs 表。
- 验证：`packages/code-editor-angular` 全量 4 个文件 81 passed；README 过 prettier。
- 剩余事项：无。
