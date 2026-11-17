---
id: ADESK-US-121
title: 备忘录置顶与取消置顶
status: Done
priority: Medium
epic: ADESK-EPIC-002
created: 2026-11-18
updated: 2026-11-18
tags: [desktop, notes, data]
dependsOn: [ADESK-US-116]
capabilities: []
---

# 备忘录置顶与取消置顶

作为整理笔记的用户，我希望把重要笔记置顶或取消置顶，列表能立即反映状态，并且刷新后仍然保留选择。

## 范围边界

### In Scope

- 在笔记编辑器工具栏、File 菜单和笔记右键菜单切换当前笔记的 Pin/Unpin 状态。
- 置顶操作通过真实本地 SQLite 事务写入 `pinned` 字段，活查询收到结果后更新列表；置顶笔记保持置顶优先排序并显示状态。
- 保存正文或标题前核对当前基线；笔记已被其他窗口修改或删除时拒绝静默覆盖，保留当前编辑内容和可重试错误。
- 置顶和取消置顶的成功、失败与刷新后状态均可通过键盘可达控件和浏览器自动验收。

### Out of Scope

- 自定义文件夹、新建文件夹和云端同步。
- iCloud、远程笔记服务与跨设备同步。

## 验收标准

| # | 前置条件 | 操作 | 预期结果 | 状态 |
| --- | --- | --- | --- | --- |
| 1 | 已有普通笔记 | 选中笔记并执行 Pin | `pinned` 在真实 SQLite 中变为 `1`，列表显示置顶状态 | ✅ |
| 2 | 已置顶笔记 | 执行 Unpin | `pinned` 在真实 SQLite 中变为 `0`，列表移除置顶状态 | ✅ |
| 3 | 已有笔记 | 刷新或重新进入 Notes | Pin/Unpin 状态从本地库恢复，置顶优先排序保持 | ✅ |
| 4 | 另一窗口修改或删除笔记 | 执行 Pin/Unpin | 事务拒绝冲突，当前编辑内容不被静默丢弃 | ✅ |
| 5 | 本地正式构建 | 键盘可达控件、真实 SQLite 写入和浏览器回归 | 主要路径通过并有原始报告，不替代人工读屏验收 | ✅ |

## 验收证据

2026-11-18 本地正式构建自动验收完成，未提交、未发布。`notes-actions` 在生产构建上验证普通笔记的 Pin 与 Unpin 都写入真实 SQLite，报告见[证据](../../evidence/2026-11-17/aiao-notes-actions-green.json)。

- 单测 23/23 通过，`aiao-desktop-web:typecheck`、`aiao-desktop-e2e:lint` 和生产构建通过。
- `E2E_TRACE=1 NX_NO_CLOUD=true pnpm nx run aiao-desktop-e2e:e2e --group=notes-actions --parallel=1 --report=/tmp/aiao-notes-actions-green.json --output-style=static`：1 组全绿，`pinPersists = true`、`unpinPersists = true`，无页面错误。
- Pin/Unpin 复用 US-116 的正文与标题冲突保护；New Folder 仍留在 A06 后续范围。
