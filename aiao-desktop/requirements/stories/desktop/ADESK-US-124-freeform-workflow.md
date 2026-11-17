---
id: ADESK-US-124
title: Freeform 笔迹保存与失败保护
status: Done
priority: Medium
epic: ADESK-EPIC-002
created: 2026-11-18
updated: 2026-11-18
tags: [desktop, freeform, data]
dependsOn: [ADESK-US-106]
capabilities: []
---

# Freeform 笔迹保存与失败保护

作为记录想法的用户，我希望在 Freeform 画板上画线、清空并在本地保存；本地写入失败时，我要看到明确提示，笔迹保持可见并能在存储恢复后重试。

## 范围边界

### In Scope

- 通过真实 canvas 指针输入绘制至少两点的笔迹，笔迹颜色和点序写入 `desktop$freeform_stroke`。
- 笔迹在保存完成前继续显示；INSERT 失败时保留原笔迹、显示局部错误和 Retry，恢复后只保存一条笔迹。
- Clear 删除已保存笔迹；DELETE 失败时保留原画板、显示局部错误和 Retry，恢复后清空本地笔迹。
- 画板按 `createdAt` 恢复笔迹，刷新或重新打开 Freeform 后仍能看到已保存内容；窗口缩放会重绘笔迹。

### Out of Scope

- 橡皮擦、选区、撤销/重做、图层、协作编辑、导出和云端同步。
- 远程画板账号、跨设备同步，以及真实触控笔压感和系统级绘图能力。

## 验收标准

| # | 前置条件 | 操作 | 预期结果 | 状态 |
| --- | --- | --- | --- | --- |
| 1 | Freeform 已打开 | 在画布上拖动绘制一笔 | 笔迹真实写入 `desktop$freeform_stroke`，画布保留笔迹 | ✅ |
| 2 | 本地 INSERT 被触发器拒绝 | 再绘制一笔 | 显示可操作错误，失败笔迹仍在画布，数据库没有错误行 | ✅ |
| 3 | 存储恢复 | 点击 Retry | 失败笔迹写入 SQLite，错误消失，数据库只有一条对应记录 | ✅ |
| 4 | 画板有已保存笔迹且 DELETE 被拒绝 | 点击 Clear | 显示可操作错误，原有笔迹和数据库记录保持不变 | ✅ |
| 5 | 存储恢复 | 点击 Retry 清空 | 错误消失，所有 Freeform 笔迹从 SQLite 删除 | ✅ |
| 6 | 已保存一笔 | 刷新桌面并重新打开 Freeform | 笔迹从本地库恢复，无页面错误 | ✅ |
| 7 | 本地正式构建 | 跑 Freeform 单测、lint、typecheck、生产构建和浏览器回归 | 主要路径与失败保护通过并归档原始报告，不替代人工 VoiceOver 验收 | ✅ |

## 验收证据

2026-11-18 本地正式构建自动验收完成，未提交、未发布。正式构建上的 `freeform-workflow` 检查组验证了笔迹持久化、INSERT/DELETE 失败保护、Retry 和刷新恢复，报告见[证据](../../evidence/2026-11-17/aiao-freeform-workflow-green.json)。

- `NX_NO_CLOUD=true pnpm nx run aiao-desktop-web:typecheck --output-style=static`、`NX_NO_CLOUD=true pnpm nx run aiao-desktop-web:lint --output-style=static` 和 `NX_NO_CLOUD=true pnpm nx run aiao-desktop-e2e:lint --output-style=static`：全部通过。
- `NX_NO_CLOUD=true pnpm nx run aiao-desktop-web:build --configuration=production --output-style=static`：正式构建通过。
- `E2E_TRACE=1 NX_NO_CLOUD=true pnpm nx run aiao-desktop-e2e:e2e --group=freeform-workflow --parallel=1 --report=/tmp/aiao-freeform-workflow-green.json --output-style=static`：6 项全绿，`strokePersists`、`failedInsertKeepsStroke`、`retryPersistsStroke`、`failedClearKeepsStrokes`、`retryClearsStrokes` 和 `survivesReload` 均为 `true`，无页面错误。

Freeform 仍是本地单画板；本故事不声称提供协作、云端同步、专业绘图能力或远程账号。

## 技术笔记

`FreeformApp` 将未落库和失败笔迹分别保存在本地状态中并参与重绘；重试重新实例化实体以生成新的合法 UUID，清空在事务内删除已保存笔迹，错误映射为用户可读提示。

## 实现文件

- `aiao-desktop/apps/web/src/app/apps/freeform/freeform.ts` — canvas 输入、持久化、重试、清空和错误反馈
- `aiao-desktop/apps/web/src/app/apps/freeform/freeform-ink.ts` — 笔迹可见性与未落库状态
- `aiao-desktop/apps/web/src/app/apps/freeform/freeform.entities.ts` — `FreeformStroke` 实体
- `aiao-desktop/apps/e2e/src/groups/freeform-workflow.mjs` — 正式构建浏览器验收

## References

- [A06 内置应用任务核查与补齐](../../plans/2026-11-17-builtin-workflows.md)
- [Aiao Desktop 验收台账](../../verification-report.md)
