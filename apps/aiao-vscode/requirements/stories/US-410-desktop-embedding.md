---
id: US-410
title: 作为集成应用嵌入 Aiao Desktop
status: In Review
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

- 握手：`main.ts` 在启动 Angular 之前调用 `@aiao/orbit/client` 的 `connectOrbitClient()`。被桌面嵌入时 SDK 移除地址里的 `__aiao_orbit` 参数后再启动；直接访问或被普通 iframe 嵌入时立即返回空，启动流程与原来完全一样。握手只接受受信桌面来源的宿主（`isTrustedDesktopOrigin`：`desktop.aiao.io`、`aiao-desktop.pages.dev`、`preview.aiao-desktop.pages.dev` 与本机任意端口的 `localhost` / `127.0.0.1`）：握手令牌取自本应用的地址，任何站点嵌入本应用都能自选令牌，只有来源准入能挡住冒充桌面的宿主；来源不受信的宿主发来的握手被忽略，按握手超时失败。桌面代办 GitHub 授权同样只认握手时浏览器给出的宿主来源，不信宿主自报的属性。
- 就绪：工作台挂载到页面后（与 `ready` 信号同一时刻）调用 `client.ready()`；启动失败（工作台显示错误）时调用 `client.fail(原因)`，桌面立刻显示原因，不必等超时。
- 托管响应头：`public/_headers` 给全部路径加 `Cross-Origin-Resource-Policy: cross-origin`。宿主页带 COEP 时，没有它的文档会被浏览器拦下（2026-11-13 实测线上 `ERR_BLOCKED_BY_RESPONSE`）。不加 `frame-ancestors`，嵌入范围与现在一致。
- 发布：发布流程（[deploy/README](../../deploy/README.md)）发布后加一步桌面线上验收 `aiao-desktop-e2e:verify-aiao-code`。

不在范围：跨源 iframe 的目录句柄、与桌面的主题联动和窗口标题同步。文件输入由 US-412 承接；嵌入 GitHub 登录由 [ADESK-US-203 #7](../../../../aiao-desktop/requirements/stories/application/ADESK-US-203-aiao-code.md#验收标准) 验收，不放宽 iframe sandbox。

## 验收

| 行为                                                                        | 证据                                                                                                                                                      | 状态 |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 不在桌面里：直接访问或普通 iframe 嵌入，不握手、照常启动                    | `orbit-embedding.spec.ts`；发布前的工作台 e2e（`workbench.config.ts`，10 个用例）通过；发布后直接访问线上：工作台出现，地址不变                           | ✅   |
| 在桌面里：启动前握手，工作台挂载后报告就绪，启动失败报告原因                | `orbit-embedding.spec.ts`、`app.component.spec.ts`；桌面验收 `aiao-desktop-e2e:verify-aiao-code --vscode-dist` 对本地产物 6 项全过；发布后对线上 6 项全过 | ✅   |
| 文档响应带 CORP，带 COEP 的宿主能嵌入，嵌入后 `crossOriginIsolated` 为 true | `verify-pages-routing`（wrangler pages dev）检查入口与资产页的 CORP 恰好一个值；本地产物嵌入后为 true；线上入口带恰好一个 CORP 值                         | ✅   |
| 原有工作台行为不回归                                                        | `aiao-vscode:test`（79 个文件、1256 个用例）；工作台 e2e 10 个用例；`verify-functions` 11 项                                                              | ✅   |

## 实现文件

- `apps/aiao-vscode/src/main.ts` — 启动前握手。
- `apps/aiao-vscode/src/app/orbit-embedding.ts` — 客户端的注入令牌与就绪 / 失败上报。
- `apps/aiao-vscode/src/app/app.component.ts` — 在工作台挂载与失败处上报。
- `apps/aiao-vscode/public/_headers` — CORP 响应头。
