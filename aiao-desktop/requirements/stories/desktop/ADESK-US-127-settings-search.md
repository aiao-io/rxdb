---
id: ADESK-US-127
title: Settings 分区搜索
status: Done
priority: Medium
epic: ADESK-EPIC-002
created: 2026-11-18
updated: 2026-11-18
tags: [desktop, settings, search]
dependsOn: [ADESK-US-101]
capabilities: []
---

# Settings 分区搜索

作为调整桌面设置的用户，我希望能按分区名称搜索系统设置，并在没有结果时看到明确反馈，快速进入需要的设置页面。

## 范围边界

### In Scope

- Settings 搜索框绑定本地设置分区，按分区名称过滤，不区分大小写并支持清空恢复完整分区列表。
- 搜索结果保持原有分组和顺序；无匹配结果时显示明确空状态。
- 点击筛选结果后，右侧标题和设置面板切换到对应分区。

### Out of Scope

- 远程账号设置、系统级权限中心、网络服务和硬件控制。
- 每个设置面板内部所有控件的完整失败路径与系统 API 集成。
- 真实 macOS 系统偏好同步和跨设备设置同步。

## 验收标准

| #   | 前置条件        | 操作                                                    | 预期结果                                                 | 状态 |
| --- | --------------- | ------------------------------------------------------- | -------------------------------------------------------- | ---- |
| 1   | Settings 已打开 | 查看分区列表                                            | 初始显示 11 个本地设置分区，顺序稳定                     | ✅   |
| 2   | Settings 已打开 | 搜索 `Network`                                          | 只显示 Network 分区                                      | ✅   |
| 3   | 有筛选结果      | 点击 Network                                            | 右侧标题切换为 Network，显示对应面板                     | ✅   |
| 4   | Settings 已打开 | 搜索不存在的内容                                        | 显示 `No matching settings`，分区列表为空                | ✅   |
| 5   | 搜索结果为空    | 清空搜索                                                | 恢复完整的 11 个设置分区                                 | ✅   |
| 6   | 本地正式构建    | 跑 Settings 单测、lint、typecheck、生产构建和浏览器回归 | 主要路径通过并归档原始报告，不声称系统设置能力已完整实现 | ✅   |

## 验收证据

2026-11-18，本地正式构建自动验收完成，未提交、未发布。`settings-workflow` 检查组验证了初始分区、分区搜索、空结果、清空恢复和详情联动，报告见[证据](../../evidence/2026-11-17/aiao-settings-workflow-green.json)。

- `pnpm nx run aiao-desktop-web:test -- --coverage.enabled=false --run src/app/apps/settings/settings-data.spec.ts`：3 条 Settings 搜索模型用例通过。
- `pnpm nx run aiao-desktop-web:typecheck` 和 `pnpm nx run aiao-desktop-e2e:lint`：通过。
- `pnpm nx run aiao-desktop-e2e:e2e --args='--group=settings-workflow --parallel=1 --report=../../requirements/evidence/2026-11-17/aiao-settings-workflow-green.json'`：5 项全绿，`initialSections`、`searchesBySection`、`emptySearch`、`clearsSearch` 和 `sectionFollowsSelection` 均为 `true`，无页面错误；E2E target 的依赖任务完成生产构建。

本故事只关闭 Settings 本地分区搜索和选择联动；各面板内部完整系统 API、远程账号、权限中心和跨设备同步仍未接入。

`2026-11-24` 分支评审修复：Sound 面板的 Mute 开关原来只改外观，现在与蓝牙、Dock 放大等开关一样双向绑定系统状态（静音状态本来就持久化，并被菜单栏与音乐合成器读取）。同一检查组新增 `settingsWorkflow.muteSwitchMutesSystem`：打开静音后菜单栏音量按钮的无障碍名称为 `Sound, muted`，再点一次恢复音量百分比。

## 技术笔记

`filterSettingsGroups` 在保留分组顺序的同时过滤分区；`SettingsApp` 用信号绑定搜索框，模板只渲染可见分组，选择结果继续由现有 `findSection` 和面板切换逻辑处理。

## 实现文件

- `aiao-desktop/apps/web/src/app/apps/settings/settings.ts` — 查询状态和可见分区
- `aiao-desktop/apps/web/src/app/apps/settings/settings.html` — 搜索绑定和空状态
- `aiao-desktop/apps/web/src/app/apps/settings/settings-data.ts` — 分区筛选模型
- `aiao-desktop/apps/web/src/app/apps/settings/settings-data.spec.ts` — 搜索模型单测
- `aiao-desktop/apps/e2e/src/groups/settings-workflow.mjs` — 正式构建浏览器验收

## References

- [A06 内置应用任务核查与补齐](../../plans/2026-11-17-builtin-workflows.md)
- [Aiao Desktop 验收台账](../../verification-report.md)
