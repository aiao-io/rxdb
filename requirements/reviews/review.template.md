---
id: RV-<uuid>
title: '<问题一句话>'
project: '<真实 Nx 项目名>'
branch: '<完整分支 ref 或 detached worktree 标识>'
range: project
base_ref: null
review_scopes: []
scope_id: '<与模型无关的作用域标识>'
status: Open
severity: P2
source_view: commit
source_snapshot: '<完整提交 SHA 或 worktree 快照标识>'
base_sha: null
created: YYYY-MM-DD
updated: YYYY-MM-DD
affected_projects: []
related_findings: []
pr: null
---

# <ID>：<问题一句话>

## 问题与影响

写明确切触发条件、用户影响及严重程度依据。只记录存在具体证据的问题。range/base/scope 保存首次发现来源；后续其他评审范围写入 review_scopes 或处理事件，不因此重建问题。

## 证据与根因

记录对应快照的路径、符号或短代码片段、调用链与复现方式；分支差异评审还需指出引入或放大问题的变化。

## 修复方向

写最小修复范围与需要核对的框架、消费者或后端契约。提出方向不代表补丁已经完成。

## 处理记录

每次发现、修复、复核、异议或重开都追加一个事件，填写真实值；已有事件不被后一个模型覆盖。

### EV-<uuid>：发现

- 时间：<含时区的实际时间>
- 操作：review/full 或 review/incremental
- 执行者：<human/ai；provider、model、version、session；无法取得的身份字段写 unknown>
- 输入快照：<真实 SHA 或隔离工作区清单摘要>
- 输出快照：<没有代码变化时同输入>
- 状态：未登记 → Open
- 结论：<发现与证据>
- 验证：<实际命令、结果；未执行时明确写未执行及原因>
- 剩余事项：<待确认或待修复内容>

修复事件补充改动路径、修复前后行为、回归结果及验证缺口；状态先为 Fixed，复核有效再为 Resolved。
异议事件补充反证、不修理由与建议裁决；提出异议为 Disputed，证实不成立为 Dismissed，维护者明确接受风险为 Accepted。
关闭后保留本文件。状态与命名的唯一约定见仓库根 requirements/CONVENTIONS.md。
