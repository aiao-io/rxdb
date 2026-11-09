---
id: RV-<uuid>
title: '<问题一句话>'
project: '<真实 Nx 项目名>'
status: Open
severity: '<P0 | P1 | P2 | P3>'
anchors: ['<path>#<symbol>']
affected_projects: []
related_findings: []
found_on_branch: '<首次发现时的完整分支 ref；detached 写 null>'
found_view: commit
found_snapshot: '<首次发现时的提交 SHA；工作区视图写树 SHA>'
found_range: project
found_base: null
created: YYYY-MM-DD
updated: YYYY-MM-DD
pr: null
---

# <ID>：<问题一句话>

## 问题与影响

写明触发条件、用户影响和严重程度依据（级别定义见 skill 的评审标准 `.agents/skills/ai-code-review/references/rubric.md`）。只记录有具体证据的问题。

## 证据与根因

源码位置写成行内代码（如 `packages/x/src/a.ts:120`）并注明快照 SHA，或用带提交 SHA 的 GitHub 永久链接；不写指向源码的相对链接。写出符号、短代码片段、调用链与复现方式；分支差异评审还要指出引入或放大问题的改动。

## 修复方向

最小修复范围，以及需要一起核对的三框架绑定、消费者或后端契约。写出方向不代表补丁已经完成。

## 处理记录

每次发现、修复、复核、异议、重开或合并重复记录都追加一个事件，填真实值；已有事件不改写、不删除。

### EV-<uuid>：发现

- 时间：<含时区的实际时间>
- 操作：review/full、review/incremental 或 review/independent
- 执行者：<ai 或 human>；<provider>/<model>；会话 <session>；取不到的字段写 unknown
- 输入快照：<提交 SHA 或工作区树 SHA>
- 输出快照：<没有代码变化时同输入>
- 状态：未登记 → Open
- 结论：<发现与证据>
- 验证：<实际命令与结果；没执行就写明原因>
- 剩余事项：<待确认或待修复的内容>

修复事件补写改动路径、修复前后行为、回归与检查结果：回归转绿且检查通过才写 Fixed，否则状态不变。
复核与异议按仓库根 requirements/CONVENTIONS.md 的状态转移表改状态；关闭后保留本文件。
