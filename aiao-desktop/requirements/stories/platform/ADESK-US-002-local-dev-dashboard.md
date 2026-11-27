---
id: ADESK-US-002
title: 本地开发入口与开发导航
status: Done
priority: Medium
epic: ADESK-EPIC-001
created: 2026-11-12
updated: 2026-11-12
tags: [tooling, dev, nx]
dependsOn: [ADESK-US-001]
capabilities: []
---

# 用户故事：本地开发入口与开发导航

## 作为/我想要/以便

**作为** Aiao Desktop 的开发者
**我想要** 用一条 `pnpm nx dev aiao-desktop` 启动本地开发服务，并自动打开一个开发导航页
**以便** 不用记端口和命令，就能进入桌面、确认终端需要的跨源隔离已生效、复制常用命令、打开相关文档。

## 范围边界

### In Scope

- 产品根的 `dev` 目标：先检查固定端口，再启动 web 的开发服务器与开发导航并等它们就绪，最后打开浏览器（`AIAO_DEV_OPEN=false` 可关）。做法参考 aiao-media 的开发入口。
- 固定端口：Web 开发服务器 `localhost:4410`、正式构建预览 `127.0.0.1:4411`、开发导航 `127.0.0.1:4412`；被占用即报错，不换号，不停止占用者。
- 开发导航：服务入口与实时状态（是否运行、跨源隔离响应头是否齐全）、常用命令一键复制、在 VS Code 中打开的文档与源码、当前检出位与分支。
- 正式构建预览改为常驻服务，打出就绪行后不再被 Nx 当作任务完成而停掉。

### Out of Scope

- 在 `nx dev` 里同时启动正式构建预览：它不随代码热更新，按需单独启动。
- 从导航页直接打开某个内置应用：web 目前只认 `?boot=0` 与 `#noboot` 两个地址参数。
- 让其他机器访问开发导航。

## 验收标准

| #   | 前置条件              | 操作                                                | 预期结果                                                                                                                                 | 状态 |
| --- | --------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | 三个固定端口空闲      | 执行 `AIAO_DEV_OPEN=false pnpm nx dev aiao-desktop` | 先跑 `dev-ports`，再启动 `dev-dashboard` 与 web 的 `serve`，两者就绪后运行 `dev`；`localhost:4410` 返回 200，`127.0.0.1:4412` 返回导航页 | ✅   |
| 2   | `nx dev` 运行中       | 再跑一次端口检查                                    | 逐个报出被占用的服务与地址（Web 开发服务器、开发导航）后失败；不换端口，正在运行的服务不受影响                                           | ✅   |
| 3   | 导航页已打开          | 查看服务卡片                                        | 开发服务器显示「运行中」与「跨源隔离 ✓」；预览未启动时只显示「未启动」，不显示隔离状态                                                   | ✅   |
| 4   | 导航页已打开          | 执行 `pnpm nx run aiao-desktop-web:serve-static`    | 预览常驻在 `127.0.0.1:4411` 并返回 COOP / COEP 响应头；导航页随后显示它「运行中」与「跨源隔离 ✓」                                        | ✅   |
| 5   | 导航页已打开          | 点常用命令旁的「复制」                              | 命令写入剪贴板，页面提示已复制                                                                                                           | ✅   |
| 6   | 开发服务器已就绪      | 打开 `localhost:4410/?boot=0`                       | Finder 窗口出现，页面的 `crossOriginIsolated` 为 true                                                                                    | ✅   |
| 7   | 开发导航运行中        | 用其他 Host、POST 或未知路径请求                    | 分别返回 403、405 与 404；页面响应带 `Cache-Control: no-store` 与 `Referrer-Policy: no-referrer`；服务只监听 `127.0.0.1`                 | ✅   |
| 8   | 视口宽 390            | 打开导航页                                          | 单列排版，没有横向滚动                                                                                                                   | ✅   |
| 9   | `nx dev` 与预览运行中 | 停止它们（终端里按 Ctrl-C）                         | 三个端口全部释放                                                                                                                         | ✅   |
| 10  | 本地                  | 执行 `aiao-desktop:dev-test`                        | 端口登记与各 Nx 目标一致、端口检查、导航渲染与转义、请求处理、状态探测、打开浏览器的测试全部通过；随产品根的 `test` 进 CI                | ✅   |

验收证据：#10 是 [services.spec.mjs](../../../scripts/dev/services.spec.mjs)、[check-ports.spec.mjs](../../../scripts/dev/check-ports.spec.mjs)、[dashboard.spec.mjs](../../../scripts/dev/dashboard.spec.mjs) 与 [open-dashboard.spec.mjs](../../../scripts/dev/open-dashboard.spec.mjs)；#1～#9 在本机实跑，导航页由 Chromium 驱动，记录见[验收台账](../../verification-report.md#本地开发入口)。

## 技术笔记

做法参考 aiao-media 的 `nx dev aiao-media`：开发服务先检查固定端口，依赖项用 `waitFor: "ready"` 等就绪，最后一步打开导航并保持运行。aiao-desktop 没有服务端，开发导航由产品根的小型 Node 服务（`dashboard.mjs`）提供：`/` 返回导航页，`/status.json` 由服务端探测开发服务器与预览，页面每 3 秒刷新一次状态。导航页每次请求重新渲染，改模板刷新即见，切分支后页脚也跟着变。

web 的 `serve` 先跑产品根的 `dev-ports`，免得 Angular 开发服务器在端口被占时询问是否换端口。nx:run-commands 的 `readyWhen` 选项表示「任务完成」，正式构建预览原先打出就绪行就会被 Nx 收尾停掉；改用目标级 `readyWhen`（url）后才能常驻。端口统一登记在 `services.mjs`，由 `services.spec.mjs` 校验与各目标一致（[D-06](../../decisions.md#d-06本地开发用固定端口与开发导航)）。

## 实现文件

- `aiao-desktop/project.json` — `dev`、`dev-dashboard`、`dev-ports` 与 `dev-test`；`test`、`verify` 包含 `dev-test`。
- `aiao-desktop/apps/web/project.json` — `serve` 固定端口并先跑 `dev-ports`；`serve-static` 固定端口、改用目标级就绪探测。
- `aiao-desktop/apps/web/tools/serve-static.mjs` — 默认端口改为 4411。
- `aiao-desktop/scripts/dev/services.mjs` — 固定入口。
- `aiao-desktop/scripts/dev/check-ports.mjs` — 端口检查。
- `aiao-desktop/scripts/dev/dashboard.mjs`、`dashboard.html` — 开发导航。
- `aiao-desktop/scripts/dev/open-dashboard.mjs`、`keep-running.mjs` — 打开导航并保持运行。

## References

- [D-06](../../decisions.md#d-06本地开发用固定端口与开发导航)
- [ADESK-EPIC-001](../../epics/ADESK-EPIC-001.md)
- aiao-media 的开发入口：`codex/aiao-media-incubation` 分支的 `aiao-media/README.md`
