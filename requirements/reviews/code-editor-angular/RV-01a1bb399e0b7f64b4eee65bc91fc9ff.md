---
id: RV-01a1bb399e0b7f64b4eee65bc91fc9ff
title: 'Angular 编辑器 README 将已不存在的命令式 setter 声明为仍可用的弃用 API'
project: code-editor-angular
branch: refs/heads/codex/full-review-main-20261108
range: project
base_ref: null
review_scopes: []
scope_id: 'project:code-editor-angular'
status: Open
severity: P2
source_view: commit
source_snapshot: '0ffa3c419fcc59dc3e13d695ca4658116134bfa0'
base_sha: null
found_branch: refs/heads/codex/full-review-main-20261108
found_snapshot: '0ffa3c419fcc59dc3e13d695ca4658116134bfa0'
found_range: project
created: 2026-11-08
updated: 2026-11-08
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
