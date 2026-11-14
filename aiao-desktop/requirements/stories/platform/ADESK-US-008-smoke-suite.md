---
id: ADESK-US-008
title: 冒烟套件化
status: In Review
priority: High
epic: ADESK-EPIC-001
created: 2026-11-13
updated: 2026-11-14
tags: [platform, e2e, test]
dependsOn: [ADESK-US-101, ADESK-US-102]
capabilities: []
---

# 用户故事：冒烟套件化

## 作为/我想要/以便

**作为** Aiao Desktop 的维护者
**我想要** 把单体冒烟拆成可独立运行、互不依赖的检查组，并提供多页、持久 profile、新旧产物、多引擎这些夹具
**以便** 往冒烟里加多标签页、旧库升级、跨浏览器、外壳交互和无障碍的检查时，不必再改一个靠顺序串联的长脚本，也能只跑一组来排查。

## 范围边界

### In Scope

- **检查组化**：把冒烟按行为分组（外壳、磁盘与终端、持久化、集成应用、透明窗口、游戏……），每组可单独运行并能列出组名；不指定时按全量运行。输出 JSON 的检查项键集合与拆分前一致。
- **隔离**：每组默认用独立的浏览器上下文（独立的 OPFS），组间不共享状态；现在靠顺序串联的前提（例如磁盘组接在外壳组之后、刷新后验证持久化）改成各组自己的前置步骤。
- **夹具**：①同一上下文里的多页，给 [ADESK-US-105](../desktop/ADESK-US-105-multi-tab-sync.md) 的多标签页；②可在两次启动之间保留的持久 profile，给 [ADESK-US-106](../desktop/ADESK-US-106-database-upgrade-path.md) 的旧库升级；③同一 origin 下先后托管新旧两份产物的静态服务器，同样给 106；④引擎参数，给 [ADESK-US-005](ADESK-US-005-cross-browser-smoke.md) 的跨浏览器，chromium 为默认，其他引擎只提供入口。
- **清单绑定**：冒烟用来「逐个打开应用」的清单不再手写一份，由启动台实际条目与登记表核对；登记表新增了应用而冒烟没覆盖，或冒烟里有登记表没有的应用，都使检查失败。
- **本机实测入口**：进不了 CI 的实测要有仓库内可重跑的入口。几猫3A大作的真实 GPU 实测（[ADESK-US-103](../desktop/ADESK-US-103-saltline-game.md) #9）落成独立脚本，像 `verify-aiao-code` 一样单独运行。

### Out of Scope

- 新增被验收的行为：本故事不增加检查项，也不改桌面行为。
- 各夹具的使用方：多标签页、升级、跨浏览器、外壳交互、无障碍的检查组由它们各自的故事交付，本故事只提供夹具。
- 是否改用 `@playwright/test`：实现可以用它的夹具与 projects 提供上面的能力，也可以保留自写脚本，以 AC 为准。
- 线上验收脚本 `verify-aiao-code` 的拆分：它独立于 CI，保持现状。

## 验收标准

| #   | 前置条件                                                             | 操作                                                                                                                          | 预期结果                                                                                                                                  | 状态 |
| --- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | 拆分前先记下全量冒烟输出的检查项键集合                               | 拆分后跑全部检查组                                                                                                            | 键集合与拆分前逐项一致，全部为 true，`unopened` 为空，没有页面错误                                                                        | ✅   |
| 2   | 任一检查组                                                           | 单独运行该组；再执行列出组名的命令                                                                                            | 该组不依赖其他组先跑，独立通过；组名列表包含全部检查组                                                                                    | ✅   |
| 3   | 一次运行里连续跑两个检查组                                           | 前一组写入磁盘或系统设置                                                                                                      | 后一组看不到前一组的数据（每组独立的浏览器上下文与 OPFS）                                                                                 | ✅   |
| 4   | 多页夹具：同一上下文里开两个页面                                     | 一个页面写入 localStorage 与 OPFS 里的标记文件；再换成两个不同的上下文重复                                                    | 同一上下文里另一个页面读得到；不同上下文里读不到（固化「多标签页要用同一上下文的多页」）                                                  | ✅   |
| 5   | 持久 profile 夹具                                                    | 启动浏览器写入 OPFS 数据，关闭后用同一个 profile 再启动                                                                       | 数据仍在                                                                                                                                  | ✅   |
| 6   | 新旧产物服务器：先托管目录 A，再切到目录 B                           | 页面保持同一个 origin，刷新                                                                                                   | 加载到 B 的内容，origin 不变，A 时代写入的 OPFS 数据仍在                                                                                  | ✅   |
| 7   | 引擎参数                                                             | 以 firefox 或 webkit 引擎启动冒烟入口                                                                                         | 浏览器启动并打开桌面；通过与否不在本故事范围，失败项逐条列出                                                                              | ✅   |
| 8   | 登记表新增一个启动台应用但冒烟未覆盖；或冒烟多出一个登记表没有的应用 | 运行冒烟                                                                                                                      | 两种情况都失败，并指出应用 id                                                                                                             | ✅   |
| 9   | 有 GPU 的本机 Chrome                                                 | 运行几猫3A大作的实测脚本                                                                                                      | 输出到达标题画面的耗时、指针锁定、帧率、Esc 后暂停、最小化后游戏循环是否仍在运行，口径与 ADESK-US-103 #9 一致；脚本不进 CI                | ✅   |
| 10  | 全量冒烟                                                             | 同一台机器、同一份正式构建上，拆分前的单体脚本（固定提交）与拆分后的全部检查组（不含夹具自检组）各跑 3 次，比较总耗时的中位数 | 拆分后的中位数不超过拆分前的 1.1 倍；机器、Node 与 Chromium 版本、是否清缓存和短 SHA 都记入验收台账，夹具自检组的耗时单列、不计入这条比较 | ⚠️   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

验收证据：#1、#2、#3、#8、#10 由 `aiao-desktop-e2e:e2e` 的实跑覆盖；#4～#7 由夹具自检（一个不依赖桌面的 `fixtures` 检查组）覆盖；#9 是本机实跑，结论按日期记入验收台账。

## 技术笔记

- 现状是一个脚本：一次 `chromium.launch()`、一个 `browser.newContext()`、一个 `context.newPage()`，检查组靠顺序串联（磁盘组接在外壳组之后，持久化检查在同一次运行里刷新），整份冒烟约 115 秒（见验收台账；那是当时一次运行的读数，AC#10 的基线要按 [CONVENTIONS 的测量口径](../../CONVENTIONS.md#测量口径)在拆分前重新实测）。`APPS` 是手写的第二份应用清单。`verify-aiao-code.mjs` 是独立脚本。
- Playwright 不同 BrowserContext 的存储互相隔离（OPFS、BroadcastChannel、Web Locks 都不共享），多标签页要用同一个 context 里的多个 page；AC#4 把这一点固化成夹具自检。
- 拆分时保留的约束：外网请求全部拦截、任何页面错误都判失败、e2e 只经 web 的构建产物验证、不 import web 的源码（[D-02](../../decisions.md#d-02产品根目录与应用拆分)）。
- 检查项键集合的拆分前快照，在动手拆之前先落到文件里，作为 AC#1 的比对基准。

## 实现文件

- `aiao-desktop/apps/e2e/src/smoke.mjs` — 拆成检查组，具体文件布局实现时定。
- `aiao-desktop/apps/e2e/src/`（新增）— 夹具：多页、持久 profile、新旧产物服务器、引擎参数。
- `aiao-desktop/apps/e2e/src/verify-saltline.mjs`（新增）— 几猫3A大作的本机实测。
- `aiao-desktop/apps/e2e/project.json` — `e2e` 目标的参数转发。

## 本轮验收（2026-11-14）

独立检查组、多页、持久 profile、新旧产物切换、引擎参数和登记表覆盖门禁均有自检。原七组的键集合对照一致；GPU 实测脚本已在本机 Chrome + Metal 跑三轮。

原始记录：[smoke-benchmark.json](../../evidence/2026-11-14/smoke-benchmark.json)、[smoke-benchmark-exclusive.json](../../evidence/2026-11-14/smoke-benchmark-exclusive.json)、[saltline-gpu-1.json](../../evidence/2026-11-14/saltline-gpu-1.json)、[saltline-gpu-2.json](../../evidence/2026-11-14/saltline-gpu-2.json)、[saltline-gpu-3.json](../../evidence/2026-11-14/saltline-gpu-3.json)、[chromium-1.json](../../evidence/2026-11-14/chromium-1.json)；执行环境、命令和证据边界见[证据索引](../../evidence/2026-11-14/README.md)与[验收台账](../../verification-report.md)。

AC#10 的后续独占调度对照中位数为单体116.024s、拆分89.344s（0.77004倍），符合1.1倍数值门槛；首次拆分为1.10543倍，失败样本保留。两次都是2026-11-14回溯测量，不能补造“实现前已记录基线”的历史流程证据，该保留项需评审。

## References

- [ADESK-EPIC-001](../../epics/ADESK-EPIC-001.md)
- [ADESK-US-005 跨浏览器与窄屏验收](ADESK-US-005-cross-browser-smoke.md)
- [ADESK-US-105 多标签页实时互通](../desktop/ADESK-US-105-multi-tab-sync.md)
- [ADESK-US-106 旧库升级路径](../desktop/ADESK-US-106-database-upgrade-path.md)
- [验收台账](../../verification-report.md)
