---
id: US-407
title: 首次进入欢迎视图：打开文件夹、最近项目与 Demo 初始化
status: In Progress
priority: Medium
epic: epic-003-ui-developer-tools
created: 2026-11-03
updated: 2026-11-03
tags: [aiao-vscode, welcome, explorer, file-system-access, first-run]
---

# 用户故事：首次进入欢迎视图：打开文件夹、最近项目与 Demo 初始化

## 作为/我想要/以便

**作为** 第一次打开 Aiao Code 的开发者
**我想要** 首次进入不自动初始化任何项目，资源管理器像 vscode.dev 一样提供「打开文件夹」与「打开最近的文件」入口，外加一个「初始化 Demo 项目」按钮
**以便** 由我自己决定工作起点：打开本地文件夹、回到最近的项目，或用内置 Demo 快速体验

具体症状：当前首次打开空目录会自动创建 React / Vue / Angular 三个 Demo 项目并打开第一个
（[`mount.ts`](../../src/workbench/mount.ts) 的 ready 流程），用户不能停留在空状态，也没有打开本地文件夹的
入口；[vscode.dev](https://vscode.dev/) 首次进入不初始化项目，资源管理器显示欢迎视图（打开文件夹 / 打开最近）。

## 范围边界

### In Scope

- 首启不初始化：不再自动创建 Demo、不自动打开任何项目；`initialProjectId` 宿主选项保留，最近项目经欢迎视图一键恢复。
- 欢迎视图：无项目打开时资源管理器渲染欢迎视图（「尚未打开项目」+ 打开文件夹 + 最近列表 + 初始化 Demo 项目）。
- 打开文件夹：File System Access API 选择目录，递归读入文本与二进制，登记为受控模板项目并打开；
  含合法 `workbench.project.json` 时沿用其模板与入口，否则按 vanilla 推断入口并补写配置文件。
- 打开最近的文件：欢迎视图列出最近项目（按更新时间倒序），点击打开并恢复上次标签与活动文件。
- 初始化 Demo 项目：选择 React / Vue / Angular 最小 Demo 后创建并打开；目录中已存在同 id 项目时直接打开。

### Out of Scope

- 单文件打开（`showOpenFilePicker`）与跨项目的最近「文件」索引：最近列表以项目为单位。
- 文件夹写回（把浏览器内编辑同步回本地磁盘）与目录监听热更新：打开文件夹是单向导入。
- 项目删除 / 最近列表清空：目录治理未立项前不提供。
- GitHub 打开入口：由 US-406 承担，欢迎视图不重复。

## 交付阶段

单一阶段：内核（`src/workbench/`）与 Angular 外壳共用同一欢迎视图与入口，无 A/B/C 分期。
重开不自动打开项目，恢复最近项目走欢迎视图最近列表；`initialProjectId` 选项仍供宿主显式指定。

## 验收标准

| #   | 前置条件                                   | 操作                                                | 预期结果                                                                                                                                | 状态 |
| --- | ------------------------------------------ | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | 首次打开，项目目录为空                     | 等待工作台就绪                                      | 不调用后端 create、不打开任何项目；资源管理器显示欢迎视图（打开文件夹 / 最近区块隐藏 / 初始化 Demo 项目）；保存与运行禁用，新建项目可用 | ✅   |
| 2   | 项目目录非空，重开工作台                   | 等待工作台就绪                                      | 不自动打开任何项目；欢迎视图的最近区块按更新时间倒序列出项目                                                                            | ✅   |
| 3   | 欢迎视图显示，无项目打开                   | 点击「初始化 Demo 项目」选 React 最小 Demo          | 以固定 id `default-react` 创建并打开，文件树与预览就绪；再次进入欢迎视图选同 id 项目时直接打开，不重复 create                           | ✅   |
| 4   | 欢迎视图显示，浏览器支持目录选择器         | 点击「打开文件夹」并在系统选择器中取消              | 无任何写入、无错误日志，停留欢迎视图                                                                                                    | ⚠️   |
| 5   | 选择含合法 `workbench.project.json` 的目录 | 确认选择                                            | 按配置的模板与入口登记项目并打开；文本按 UTF-8 读入、二进制保持字节；`.git` / `node_modules` 跳过；文件数或总大小超限给出明确提示       | ⚠️   |
| 6   | 选择不含 `workbench.project.json` 的目录   | 确认选择                                            | 按 vanilla 模板从入口候选（`src/main.ts` 等）推断入口，补写 `workbench.project.json` 后登记并打开                                       | ⚠️   |
| 7   | 欢迎视图显示，存在历史项目                 | 点击最近区块中的某个项目                            | 打开该项目并恢复其上次标签与活动文件，欢迎视图消失                                                                                      | ✅   |
| 8   | 浏览器不支持 File System Access API        | 点击「打开文件夹」                                  | 给出明确提示（能力缺失），不崩溃                                                                                                        | ✅   |
| 9   | 内核与需求文档就绪                         | 跑 `pnpm nx test aiao-vscode` 与 lint / format 门禁 | 新增 welcome / folder-import 用例通过；原「空目录自动创建 Demo」用例替换为新行为断言；无新增 lint / format 告警                         | ✅   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

AC#4～6 的目录选择器链路已由单测覆盖（打桩 `showDirectoryPicker`），真实系统选择器需手动验收一次；

## 验收证据

| 范围           | 可重跑入口与证据                                                                                                                         |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 内核单测       | `pnpm nx test aiao-vscode`（543 用例全绿）：mount spec 欢迎视图行为 + folder-import spec（读目录 / 推断 / 上限）                         |
| 浏览器手动验收 | 2026-11-03 生产构建 + 静态服务实测：首启欢迎视图（无自动创建）→ 初始化 Demo 菜单三选一 → 打开并预览 → 重开停在欢迎视图、最近列表恢复项目 |
| 应用 e2e       | `pnpm nx run aiao-vscode-e2e:e2e`（如新增长首启用例）                                                                                    |

## 技术笔记

- 目录读取复用 [`file-encoding.ts`](../../src/workbench/git/file-encoding.ts) 的 `decodeFileBytes`：
  文本路径启发式 + NUL 字节判定，与编辑器可编辑范围保持一致；二进制（图片等）按字节保留。
- 上限对齐导入归档：最多 2000 个文件、24 MiB 总量；`showDirectoryPicker({ mode: 'read' })`，取消（`AbortError`）静默。
- 模板推断：合法 `workbench.project.json`（template 在受控集合内且 entry 存在）直接沿用；否则 vanilla +
  入口候选 `src/main.ts` / `src/main.js` / `src/main.tsx` / `src/main.jsx` / `main.ts` / `main.js` / `src/index.ts` / `src/index.js` /
  `index.ts` / `index.js`，均无命中回退 `src/main.ts`（可编辑，预览编译给出问题）。
- 欢迎视图渲染挂在 `renderFiles` 的无项目分支，初始化期间树保持空白避免闪动；ready 收尾补一次渲染。
- 三框架对称：外壳为 Angular 应用，内核在框架无关的 `src/workbench/`，无三端绑定问题（沿用 US-404 结论）。

## 实现文件

- `apps/aiao-vscode/src/workbench/folder-import.ts` + `folder-import.spec.ts` — 目录读取与模板 / 入口推断
- `apps/aiao-vscode/src/workbench/mount.ts` — ready 流程移除自动创建、欢迎视图渲染与三个入口动作
- `apps/aiao-vscode/src/workbench/workbench-style.ts` — 欢迎视图样式
- `apps/aiao-vscode/src/workbench/mount.spec.ts` — 欢迎视图行为用例（替换空目录自动创建用例）

## References

- [vscode.dev](https://vscode.dev/) 资源管理器欢迎视图（打开文件夹 / 打开最近）
- [US-404 浏览器本地开发工作台](US-404-browser-development-workbench.md)
- [US-406 GitHub 连接与远程仓库提交推送](US-406-github-remote-repositories.md)
