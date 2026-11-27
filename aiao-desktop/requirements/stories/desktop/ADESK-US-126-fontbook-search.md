---
id: ADESK-US-126
title: Font Book 字体族搜索
status: Done
priority: Medium
epic: ADESK-EPIC-002
created: 2026-11-18
updated: 2026-11-18
tags: [desktop, fontbook, search]
dependsOn: [ADESK-US-101, ADESK-US-102]
capabilities: []
---

# Font Book 字体族搜索

作为查看字体目录的用户，我希望能按字体族名称搜索本地字体，并在没有结果时看到明确反馈，快速定位要预览的字体。

## 范围边界

### In Scope

- Font Book 搜索框绑定本地字体族目录，按字体族名称过滤，不区分大小写并支持清空恢复完整列表。
- 无匹配结果时显示明确空状态，不保留已经消失的字体详情。
- 筛选后选择字体族，标题和示例文字继续对应当前字体。

### Out of Scope

- 安装、删除、启用或停用系统字体。
- 字体文件导入、字体冲突检测、收藏夹和最近使用记录。
- 浏览器之外的系统字体管理能力与远程字体同步。

## 验收标准

| #   | 前置条件         | 操作                                                     | 预期结果                                               | 状态 |
| --- | ---------------- | -------------------------------------------------------- | ------------------------------------------------------ | ---- |
| 1   | Font Book 已打开 | 查看字体族列表                                           | 初始显示 8 个本地字体族，顺序稳定                      | ✅   |
| 2   | Font Book 已打开 | 搜索 `JetBrains`                                         | 只显示 JetBrains Mono，详情标题同步变化                | ✅   |
| 3   | Font Book 已打开 | 搜索不存在的内容                                         | 显示 `No matching fonts`，字体族列表为空               | ✅   |
| 4   | 搜索结果为空     | 清空搜索                                                 | 恢复完整的 8 个字体族列表                              | ✅   |
| 5   | 字体族列表可见   | 选择 Georgia                                             | 标题和示例文字都对应 Georgia                           | ✅   |
| 6   | 本地正式构建     | 跑 Font Book 单测、lint、typecheck、生产构建和浏览器回归 | 主要路径通过并归档原始报告，不声称提供系统字体管理能力 | ✅   |

## 验收证据

2026-11-18，本地正式构建自动验收完成，未提交、未发布。`fontbook-workflow` 检查组验证了初始字体目录、字体族搜索、空结果、清空恢复和详情联动，报告见[证据](../../evidence/2026-11-17/aiao-fontbook-workflow-green.json)。

- `pnpm nx run aiao-desktop-web:test -- --coverage.enabled=false --run src/app/apps/font-book/font-book-data.spec.ts`：3 条 Font Book 搜索模型用例通过。
- `pnpm nx run aiao-desktop-web:typecheck` 和 `pnpm nx run aiao-desktop-e2e:lint`：通过。
- `pnpm nx run aiao-desktop-e2e:e2e --args='--group=fontbook-workflow --parallel=1 --report=../../requirements/evidence/2026-11-17/aiao-fontbook-workflow-green.json'`：5 项全绿，`initialFamilies`、`searchesByFamily`、`emptySearch`、`clearsSearch` 和 `detailFollowsSelection` 均为 `true`，无页面错误；E2E target 的依赖任务完成生产构建。

本故事只关闭 Font Book 本地字体族搜索和预览联动；系统字体安装、删除、冲突处理、收藏和最近使用仍未接入。

## 技术笔记

`filterFontFamilies` 对本地字体族摘要执行规范化查询；`FontBookApp` 用字体族名称保存选择状态，筛选后自动回退到第一条可见字体，详情随当前结果计算。

## 实现文件

- `aiao-desktop/apps/web/src/app/apps/font-book/font-book.ts` — 查询、筛选、稳定选择和详情联动
- `aiao-desktop/apps/web/src/app/apps/font-book/font-book.html` — 搜索绑定和空状态
- `aiao-desktop/apps/web/src/app/apps/font-book/font-book-data.ts` — 字体族筛选模型
- `aiao-desktop/apps/web/src/app/apps/font-book/font-book-data.spec.ts` — 搜索模型单测
- `aiao-desktop/apps/e2e/src/groups/fontbook-workflow.mjs` — 正式构建浏览器验收

## References

- [A06 内置应用任务核查与补齐](../../plans/2026-11-17-builtin-workflows.md)
- [Aiao Desktop 验收台账](../../verification-report.md)
