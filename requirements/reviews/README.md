# AI Review 规则与记录

这个目录集中存放**给 AI 做代码 review 用的规则/检查清单**，以及 review 过程中产出的结论记录。

## 用途

- **规则文件**：告诉 AI「review 时看什么、按什么标准判」的 md 文件
- **结论记录**：某次 review 发现的问题 + 根因 + 修复方案，修复后标记解决

## 目录结构

| 文件           | 说明                      |
| -------------- | ------------------------- |
| `README.md`    | 本说明与状态约定          |
| `template.md`  | 新建 review 记录的模板    |

## 状态约定

每条记录（`RV-XXX.md`）的状态用 YAML `status` 字段维护：

| 状态       | 含义                 |
| ---------- | -------------------- |
| `Open`     | 已发现，待修复       |
| `Resolved` | PR 已合并，修复落地  |

## 工作流

1. AI review 发现问题 → 从 `template.md` 复制出 `RV-XXX-描述.md`，`status: Open`
2. 开 PR 修复 → 在 `pr` 字段记录 PR 链接
3. PR 合并、修复完成 → `status: Resolved`，补 `updated` 日期

## 命名规范

- `RV-XXX-描述.md`，编号 `RV-001` 起递增，不与 story 编号 `US-XXX` 混用
