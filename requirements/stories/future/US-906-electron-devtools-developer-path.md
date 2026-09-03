---
id: US-906
title: Electron 桌面端 DevTools 面板的开发者可用路径
status: Backlog
priority: Medium
epic: epic-003-ui-developer-tools
created: 2026-09-03
updated: 2026-09-03
tags: [tooling, devtools, desktop, electron, dx]
---

<!--
INVEST 检查清单:
- [x] Independent: 只依赖 US-904 阶段 D 已交付的四段 relay 与 `--serve` 启动路径，不等任何未开工故事
- [x] Negotiable: dev 变体的承载形式（vite mode / 独立 build configuration / 构建后改写）可在 plan 阶段冻结
- [x] Valuable: 桌面开发者今天在 Electron 上完全打不开 RxDB 面板，且没有等价 workaround（桌面 SQLite / 原生文件后端在浏览器端不存在）
- [x] Estimable: 一个构建变体 + 一份 README + 一处面板文案 + E2E fixture 收敛，范围已分项
- [x] Small: 不改协议、不改面板数据面、不动生产 manifest，单 PR 可审
- [x] Testable: manifest 正负契约、真实 Electron dev 流程握手、e2e 全绿三处均可自动验收
-->

# 用户故事：Electron 桌面端 DevTools 面板的开发者可用路径

## 作为/我想要/以便

**作为** 调试 Electron 桌面应用数据层的开发者
**我想要** 有一条正式的、开箱可跑的方式在桌面应用里打开 RxDB DevTools 面板并连上数据库
**以便** 不必为了看一眼桌面 SQLite / 原生文件后端的数据就退回浏览器端（那里根本没有这两个后端），也不必自己复刻 E2E 内部的临时 manifest 副本

## 现状：两条路都不通

| 开发者的做法                                                         | inspected page          | 结果                                                           |
| -------------------------------------------------------------------- | ----------------------- | -------------------------------------------------------------- |
| 跑打包产物（`electron-package-dir` 的 `--dir` 产物）                 | `app://-/index.html`    | 面板恒停在「当前页面不支持扩展注入」                           |
| 跑 `nx serve dev-rxdb-electron` + `nx dev dev-rxdb-electron --serve` | `http://localhost:4120` | 协议对了，但 `nx build rxdb-devtools-extension` 的产物注不进去 |

两条路的原因各不相同，都已在 US-904 阶段 D 实测确认：

1. **自定义 scheme 拿不到扩展 host permission。** `app:`（`main.utils.ts` 的 `APP_SCHEME`）不在 Chromium 扩展 match pattern 的合法 scheme 集里，`app://-/*`、`<all_urls>`、两者并列三种写法实测全部注入失败。`permissionPatternForUrl` 对它返回 `null` 是正确的，这条**没有修法**。
2. **Electron 没有 `chrome.permissions` 命名空间**，所以生产 manifest 里的 `optional_host_permissions: ['<all_urls>']` 授权集恒为空。即使 inspected page 已是 http，也必须有一条**静态** `host_permissions` 才注得进去。

今天唯一带静态 `host_permissions` 的扩展产物只存在于 `devtools-restart-persistence.spec.ts` 的 `devtoolsExtensionCopy()` 里 —— 一份跑完即删的临时 dist 副本。开发者手上没有。

## 范围边界

### In Scope

- 一个 **dev-only 扩展构建变体**，产出带 `host_permissions: ['http://localhost/*']` 的 dist（match pattern 不含端口，任意端口都匹配）
- 桌面端调试流程的**文档化**：`--serve` http renderer + dev 变体扩展 + `devtools-extension.ts` 的四个 env 开关
- 面板 `unsupported` 分支从「只给结论」改成「给原因」，措辞对所有宿主成立（不写死 Electron）
- E2E 收敛到复用同一份 dev 变体产物，不再在测试内改写 manifest

### Out of Scope

- 让 `app://` 能被扩展注入 —— Chromium 侧不可能，别再试
- 往生产 manifest 加 `host_permissions` 或显式 `web_accessible_resources` —— 已实测无效并回滚，`manifest.config.spec.ts` 的两条负契约必须保住
- 放宽 `permissionPatternForUrl` 让 `app:` 返回非 `null` —— 那会把状态伪装成 `granted`，面板从诚实的「不支持」变成永远转圈的「Waiting for RxDB connection...」，正是仓库禁止的兜底
- Tauri 侧的等价能力（归 [US-905](./US-905-tauri-native-devtools.md)）
- 把 DevTools 扩展打进任何发布产物

## 验收标准

| #   | 前置条件                                                    | 操作                                                              | 预期结果                                                                                                                                                                          | 状态 |
| --- | ----------------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | 工作区已安装依赖                                            | 跑 dev-only 扩展构建变体                                          | 产物 manifest 含 `host_permissions: ['http://localhost/*']`；且默认 `nx build rxdb-devtools-extension` 的 manifest 仍**无** `host_permissions`、**无** `web_accessible_resources` | ⬜   |
| 2   | AC#1 的变体已构建；`nx serve dev-rxdb-electron` 已起在 4120 | 按文档启动 `nx dev dev-rxdb-electron`，打开 DevTools 的 RxDB 面板 | 面板进入 `granted`、四段 relay 握手完成，Database 页读到真实实体行；证据全程经过真实 extension/renderer/preload/main/host，无 mock 替代                                           | ⬜   |
| 3   | AC#1 的变体已存在                                           | 跑 `nx e2e dev-rxdb-electron-e2e`                                 | `devtools-restart-persistence.spec.ts` 不再在测试内改写 manifest（`devtoolsExtensionCopy()` 收敛为指向 dev 变体或删除），全套 e2e 仍全绿                                          | ⬜   |
| 4   | 跑打包产物（`app://` 入口），DevTools 打开 RxDB 面板        | 观察面板                                                          | 面板说明**原因**（当前页面协议不在扩展可注入的 scheme 集内），而非只给结论；状态仍为 `unsupported`，`permissionPatternForUrl('app://…')` 仍返回 `null`                            | ⬜   |
| 5   | 仓库文档                                                    | 读 `apps/rxdb-devtools-extension/README.md`                       | 写明桌面端调试的唯一成立形态、四个 env 开关的含义，以及打包态为什么不行（上面两条实测约束）                                                                                       | ⬜   |
| 6   | production 模式（不设 `DEV_RXDB_DEVTOOLS*` 任何 env）       | 启动打包产物                                                      | 一个扩展都不加载，产物内无扩展源码与加载路径（`devtools-extension-loading.spec.ts` 现有断言不得回退）                                                                             | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术笔记

**dev 变体怎么落。** `manifest.config.ts` 已是 TS 函数式配置（`defineManifest`），最小改动是按 vite mode 分支产出两份 manifest，构建目标各自用不同 `outDir`，避免 dev 变体覆盖默认产物、被 `electron-package-dir` 误打包。无论选哪种承载形式，AC#1 的**负契约**（默认产物不含 `host_permissions` / `web_accessible_resources`）是硬约束。

**dev 流程的既有零件都在，不用新造。** `apps/dev-rxdb-electron/project.json` 的 `serve`（Angular dev-server，4120）与 `dev`（`electron dist/apps/dev-rxdb-electron --serve`）已经把 renderer 换成 http；`resolveDevToolsDevConfig()` / `loadDevToolsExtension()` 已经读 `DEV_RXDB_DEVTOOLS`、`DEV_RXDB_DEVTOOLS_EXTENSION`、`DEV_RXDB_DEVTOOLS_CAPABILITY`、`DEV_RXDB_DEVTOOLS_MUTATION` 四个开关，并断言「加载前 0 个、加载后恰好 1 个」。本故事缺的只是一份开发者拿得到的扩展产物 + 一份说明。

**别踩的坑（均为实测）。**

- DevTools `TabbedPane` 会把溢出的 tab 从 DOM 里摘掉，读 tab 条前先放宽窗口（E2E 里是 `setSize(1600, 1000)`）。
- `chrome.scripting` 在**隔离世界**执行，用主世界的 `window.__AIAO_RXDB_DEVTOOLS_BRIDGE__` 判断「桥有没有注进去」永远是 false，这个观测口径是错的。
- 注入失败**完全无声**：service worker 的日志在生产构建里全关，Chromium 的安装警告也不落 stderr。唯一能看见真因的通道是在 `panel.html` 帧里直接调 `chrome.scripting.executeScript`，错误消息当场就有。

**AC#4 的边界。** 面板是三宿主共享 library，`unsupported` 在浏览器端也会出现（如 `chrome://` 页面）。文案只描述「协议不支持」这一事实，不得写死 Electron，也不得因为要给指引就去动状态机。

## 实现文件

- `apps/rxdb-devtools-extension/manifest.config.ts` — dev 变体分支（生产分支不动）
- `apps/rxdb-devtools-extension/project.json` — dev 变体构建目标
- `apps/rxdb-devtools-extension/src/manifest.config.spec.ts` — 正负契约（现有两条负断言保留，新增变体正断言）
- `apps/rxdb-devtools-extension/README.md` — 桌面端调试流程
- `modules/rxdb-devtools-panel/src/components/connection-guard.component.ts` — `unsupported` 分支文案
- `apps/dev-rxdb-electron-e2e/src/devtools-restart-persistence.spec.ts` — `devtoolsExtensionCopy()` 收敛

## References

- [US-904 阶段 D](./US-904-devtools-native-storage-contract.md) — AC#52 的真机证据与两条实测约束的出处
- [US-904 阶段 A 可行性记录](./US-904-phase-a-evidence.md) — `chrome.permissions` 缺失被登记为可容忍差异
- [Chrome 扩展 match patterns](https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns) — 合法 scheme 集（http / https / file / ftp / urn），自定义 scheme 不在其中

---

> 写作规范（证据锚点 / 结论复验 / 大故事分阶段 / 价值待证）、命名与状态约定见
> [CONVENTIONS.md](../../CONVENTIONS.md)。
