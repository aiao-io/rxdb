---
id: ADESK-US-208
title: Aiao Code 文件复制与嵌入能力边界
status: Done
priority: High
epic: ADESK-EPIC-003
created: 2026-11-17
updated: 2026-11-17
tags: [application, files, integration]
dependsOn: [ADESK-US-203, ADESK-US-206, ADESK-US-110]
capabilities: []
---

# Aiao Code 文件复制与嵌入能力边界

作为在桌面中写代码的用户，我想明确选择桌面文件导入工作台，并把文件或项目复制回桌面，以便在两个独立存储域之间交接成果。

## 范围边界

### In Scope

- 通过现有 Orbit 文件面板复制单文件和项目 ZIP，读写能力分别声明；每次上限 512 KiB，不扩大消息协议。
- 单文件导入在当前项目内创建副本，不覆盖重名文件；导出保留实际字节。项目归档复制保存路径、二进制和 Git 历史，导入使用新项目 ID。
- 桌面保存每次明确选择目标；取消不改变源数据，失败保留原项目与未保存缓冲，关闭后的迟到结果不得写入其他项目。
- 嵌入时通过浏览器文件输入导入本机文件夹副本，保留相对路径与现有文件数/字节限制，不请求目录句柄。
- 嵌入登录界面明确当前 OAuth 弹窗不可用和 PAT 路径；直接访问的既有 OAuth 行为保持。自动测试不声称真实账户授权完成。
- 桌面与 Aiao Code 各自正式构建，在受控本地跨来源环境验证真实 Orbit 与文件面板，不以替身工作台代替。

### Out of Scope

- 共享虚拟目录、自动同步、桌面目录遍历、批量消息分片及放宽 sandbox。
- 真实外部账号授权、线上版本发布和跨站点登录状态共享。

## 验收标准

| # | 前置条件 | 操作 | 预期结果 | 状态 |
| --- | --- | --- | --- | --- |
| 1 | 桌面授权读写能力 | 打开 Aiao Code 文件菜单 | 复制入口可见，数据独立与 512 KiB 边界明确；无授权时给出准确状态 | ✅ |
| 2 | 当前项目及桌面文本/二进制文件 | 选择单文件导入与导出 | 原始字节保留，重名不覆盖，导出每次经过保存面板 | ✅ |
| 3 | 可导出的本地项目 | 复制项目到桌面再导入 | 新项目保留路径、字节及 Git 历史，不覆盖原项目；坏包被拒绝 | ✅ |
| 4 | 选择、保存或导入尚未完成 | 取消、关闭、超限或模拟失败 | 不出现假成功，不破坏原数据、未保存缓冲及新项目 | ✅ |
| 5 | Aiao Code 嵌入桌面 | 通过本机文件夹输入导入 | 相对路径和字节保留，过滤规则及限制与既有目录导入一致；取消不创建项目 | ✅ |
| 6 | 嵌入的未登录工作台 | 打开 GitHub 登录 | OAuth 限制可见，不尝试被禁止的弹窗；PAT 成功/失败用受控客户端验证 | ✅ |
| 7 | 本地正式构建 | 操作复制入口和关联窗口行为 | 跨源集成、键盘、错误反馈与既有独立使用回归通过 | ✅ |

## 验收证据

2026-11-17，本地正式构建自动验收完成；所有改动未发布。原始记录与命令见[证据索引](../../evidence/2026-11-17/README.md)。

| AC | 同层证据 |
| --- | --- |
| 1 | [最终浏览器报告](../../evidence/2026-11-17/aiao-code-copy-browser-final.json)：realBuildAndIsolation、deniedCapabilitiesVisible；512 KiB 与独立副本提示、准确禁用原因。 |
| 2 | 同报告 fileCopiesKeepBytesAndDrafts、cancellationAndDuplicate；真实文本/二进制字节、当前缓冲、重名拒绝、每次保存面板。 |
| 3 | 同报告 projectArchiveRoundTrip、invalidAndOversizeRejected；真实 OPFS 项目及 Git 历史，坏 ZIP 不创建项目；归档模块单测四项覆盖率 100%。 |
| 4 | 同报告 cancellationAndDuplicate、invalidAndOversizeRejected、closeCancelsPanel；适配器及 mount 单测覆盖迟到结果、写失败、未保存缓冲和项目切换。 |
| 5 | 同报告 folderCopy；folder-input、folder-picker、folder-import 单测覆盖路径、BOM、空文件、二进制、过滤、数量/大小、取消、拒绝选择器及销毁清理。 |
| 6 | 同报告 embeddedLoginBoundary、standaloneFlowsPreserved；github-login 单测以受控客户端验证 PAT 成功/失败，不代表真实账号授权。 |
| 7 | [六组关联报告](../../evidence/2026-11-17/aiao-code-copy-regression.json)与最终10项报告，无页面错误；文件面板键盘路径、宿主权限、独立访问和窗口恢复通过。 |

完整工作台单测 1295 条与桌面 1519 条、lint/typecheck、覆盖率均通过。浏览器路由将原应用来源转到本地正式产物；菜单/面板真实操作，字节与项目断言部分通过已有测试入口访问实际后端。自动键盘与 DOM 关闭事件不代替物理输入。应用侧 US-412 按根规范保持 In Review 待评审合并。
