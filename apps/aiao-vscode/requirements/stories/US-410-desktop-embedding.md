---
id: US-410
title: 作为集成应用嵌入 Aiao Desktop
status: In Progress
priority: Medium
epic: epic-003-ui-developer-tools
created: 2026-11-13
updated: 2026-11-13
tags: [aiao-vscode, orbit, micro-frontend, deploy]
---

# 作为集成应用嵌入 Aiao Desktop

作为在 Aiao Desktop 里写代码的人，我要在桌面的窗口里打开 Aiao Code，像直接访问 vscode.aiao.io 一样新建项目、编辑和跑终端。
桌面方的需求是 [ADESK-US-203](../../../../aiao-desktop/requirements/stories/application/ADESK-US-203-aiao-code.md)（接入契约见 aiao-desktop 的 [D-12](../../../../aiao-desktop/requirements/decisions.md#d-12集成应用的接入契约)），本故事只管 Aiao Code 这一侧。

## 范围

- 握手：`main.ts` 在启动 Angular 之前调用 `@aiao/orbit/client` 的 `connectOrbitClient()`。被桌面嵌入时 SDK 移除地址里的 `__aiao_orbit` 参数后再启动；直接访问或被普通 iframe 嵌入时立即返回空，启动流程与原来完全一样。
- 就绪：工作台挂载到页面后（与 `ready` 信号同一时刻）调用 `client.ready()`；启动失败（工作台显示错误）时调用 `client.fail(原因)`，桌面立刻显示原因，不必等超时。
- 托管响应头：`public/_headers` 给全部路径加 `Cross-Origin-Resource-Policy: cross-origin`。宿主页带 COEP 时，没有它的文档会被浏览器拦下（2026-11-13 实测线上 `ERR_BLOCKED_BY_RESPONSE`）。不加 `frame-ancestors`，嵌入范围与现在一致。
- 发布：发布流程（[deploy/README](../../deploy/README.md)）发布后加一步桌面线上验收 `aiao-desktop-e2e:verify-aiao-code`。

不在范围：被嵌入时的「导入文件夹（副本）」（跨源 iframe 不能弹文件选择器）、「登录 GitHub」（弹窗被宿主的 sandbox 拦下）、与桌面的主题联动和窗口标题同步。

## 验收

| 行为                                                                       | 证据                                                                                          | 状态 |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ---- |
| 不在桌面里：直接访问或普通 iframe 嵌入，不握手、照常启动                   | `orbit-embedding.spec.ts`；直接访问线上（工作台出现，地址无变化）                             | ⬜   |
| 在桌面里：启动前握手，工作台挂载后报告就绪，启动失败报告原因               | `orbit-embedding.spec.ts`；桌面线上验收 `aiao-desktop-e2e:verify-aiao-code`                   | ⬜   |
| 文档响应带 CORP，带 COEP 的宿主能嵌入，嵌入后 `crossOriginIsolated` 为 true | 线上响应头；`aiao-desktop-e2e:verify-aiao-code`                                               | ⬜   |
| 原有工作台行为不回归                                                       | `aiao-vscode:test`；发布前的 `workbench.config.ts` e2e                                         | ⬜   |

## 实现文件

- `apps/aiao-vscode/src/main.ts` — 启动前握手。
- `apps/aiao-vscode/src/app/orbit-embedding.ts` — 客户端的注入令牌与就绪 / 失败上报。
- `apps/aiao-vscode/src/app/app.component.ts` — 在工作台挂载与失败处上报。
- `apps/aiao-vscode/public/_headers` — CORP 响应头。
