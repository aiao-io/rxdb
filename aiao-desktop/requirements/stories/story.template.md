---
id: ADESK-US-XXX
title: [简短标题]
status: Backlog
priority: Medium
epic: ADESK-EPIC-XXX # 填写本应用 epics/*.md 中已存在的 id
created: YYYY-MM-DD # 创建当天的日期；不改会被需求门禁拒绝
updated: YYYY-MM-DD # 每次修改故事时更新
tags: []
# dependsOn 写产品内的硬依赖（如 [ADESK-US-101]），capabilities 写平台能力（如 [rxdb:US-301]），没有就留空数组
dependsOn: []
capabilities: []
# 门禁只认扁平 YAML 值与行内数组；候选 AC（candidate_acs）与继承 AC（inherited_acs）本产品暂不支持，
# 要用先补齐门禁解析与回归夹具，见 requirements/CONVENTIONS.md。
---

<!--
INVEST 检查清单:
- [ ] Independent (独立): 可以独立开发吗？
- [ ] Negotiable (可协商): 细节可以讨论吗？
- [ ] Valuable (有价值): 对用户有价值吗？
- [ ] Estimable (可估算): 可以估算工作量吗？
- [ ] Small (小): 可以在一个迭代内完成吗？
- [ ] Testable (可测试): 有清晰的验收标准吗？
-->

# 用户故事：[标题]

## 作为/我想要/以便

**作为** [角色]
**我想要** [行为]
**以便** [价值/收益]

## 范围边界

### In Scope

- [本故事必须覆盖的能力]

### Out of Scope

- [明确不在本故事范围内的能力，避免膨胀]
- [候选后续阶段及解锁条件；若存在，写明不参与当前范围关闭，不将未验收 AC 标绿]

## 验收标准

| #   | 前置条件   | 操作       | 预期结果   | 状态 |
| --- | ---------- | ---------- | ---------- | ---- |
| 1   | [前置条件] | [触发动作] | [预期结果] | ⬜   |
| 2   | [前置条件] | [触发动作] | [预期结果] | ⬜   |
| 3   | [前置条件] | [触发动作] | [预期结果] | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

验收证据：[对应测试符号、产物或操作入口；验证层级须与 AC 一致，缺失证据保留待验证状态]

## 技术笔记

[实现细节、架构约束、关键类/函数、代码量估算]

## 实现文件

- `aiao-desktop/apps/<app>/src/xxx/` — [描述对应模块]

## References

- [PR 链接]
- [Issue 链接]
- [外部文档链接]

---

> 写作规范（证据锚点 / 结论复验 / 大故事分阶段 / 价值待证）见仓库根
> [CONVENTIONS.md](../../../requirements/CONVENTIONS.md)；命名、状态与验收证据的写法见本产品的
> [CONVENTIONS.md](../CONVENTIONS.md)。新建 story 时先读一遍，然后删除本提示。
