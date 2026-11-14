# Aiao Desktop 能力矩阵

本页描述当前源码与正式构建的能力。故事是否关闭只看 YAML；本次生产部署`b093f8b2`已上传并完成线上复验，证据见[发布收尾记录](evidence/2026-11-14/release-closeout.json)。2026-11-14 的复验和原始产物见[验收台账](verification-report.md)与[证据目录](evidence/2026-11-14/README.md)。

| 能力            | 当前入口与边界                                                                                                                                                                                                                                              | 验收归属                                                                                                |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 桌面外壳        | 开机、锁屏、睡眠、菜单栏、状态栏与控制中心；`?boot=0`、`#noboot` 跳过开机。                                                                                                                                                                                 | US-101、US-107；真实键盘单列。                                                                          |
| 窗口与焦点      | 移动、缩放、Zoom、最小化与还原；关闭或最小化开始时立即交接焦点，动画结束不抢回新窗口焦点。                                                                                                                                                                  | US-107、US-108；[window-manager.ts](../apps/web/src/app/services/window-manager.ts)。                   |
| 窗口布局        | [window-layout.ts](../apps/web/src/app/services/window-layout.ts) 按浏览器标签页保存几何、层叠与最小化状态；恢复时不创建多余 Finder。终端、游戏及最小化应用先恢复外框，交互后才加载。移除的应用跳过并提示。                                                 | US-104；历史Firefox复验已有同站不同源的原生Frame刷新恢复记录。                                          |
| 文件与终端      | Finder、桌面、TextEdit、预览与终端读写同一虚拟磁盘。目录行在 SQLite，文件体在 OPFS；Vivari 每标签页一台虚拟机，打开后复制磁盘，再双向扫描同步。需要 COOP/COEP。                                                                                             | US-102、US-105；终端扫描最长约 3.3 秒，再加跨页同步时限。                                               |
| 多标签页        | [tab-sync.ts](../apps/web/src/app/data/tab-sync.ts) 使文件、外观、备忘录与活查询跨页收敛，正常负载下以提交后 5 秒为验收上限；后台页恢复可见后同样计时。同时写同一文件按提交顺序最后写入生效，不弹冲突提示；目标被删除、改名或抹掉后保存失败，编辑内容保留。 | US-105；两个和三个页面、终端独立性、目标消失均有正式构建检查。                                          |
| 升级与回滚      | [schema-guard.ts](../apps/web/src/app/data/schema-guard.ts) 区分旧库、结构损坏和更高版本；按域种子补写、连续升级、中断恢复、旧标签页拒写均有检查。B0 之前已发布的旧构建没有降级保护，数据库升级后不可回滚到它们。                                           | US-106；固定构建与真实生产部署的证据分列，不把二者混称。                                                |
| 应用目录与 Dock | 清单经 [application-projection.ts](../apps/web/src/app/disk/application-projection.ts) 投影到 Applications；预装包及祖先路径在 Finder 与终端受保护，用户文件保留。Dock 支持固定、运行态、拖放与顺序持久化，键盘菜单提供拖放等效操作。                       | US-205；[dock-layout.ts](../apps/web/src/app/services/dock-layout.ts)。                                 |
| 应用运行时      | [registry.ts](../apps/web/src/app/apps/registry.ts) 只保留清单和懒加载入口；[application-runtime.ts](../apps/web/src/app/services/application-runtime.ts) 管实例、菜单与能力上下文。应用组件与独有种子按需加载；通知中心读取种子不加载应用组件。            | US-206；D-20已接受实现前未预先记录的本次流程例外，数值门槛保持。                                                  |
| 宿主能力        | `DesktopAppContext` 统一窗口、菜单、通知、外观、剪贴板和文件面板；未声明能力拒绝，实例关闭后解绑。文件凭证绑定窗口、目标与版本，冲突、取消和迟到请求不会静默写盘；远程应用拿不到 RxDB repository 或 OPFS 句柄。                                             | US-206；历史WebKit的Orbit MessagePort读取未通过，已保护入口；本轮Chrome范围不受此项阻塞。               |
| 内置应用与游戏  | 启动台条目取自同一清单；数据在首次被读取时按域初始化。几猫3A大作从同源 `saltline.html` 加载，关闭销毁，重新打开为新实例；最小化后游戏循环仍运行。                                                                                                           | US-101～103、US-206；真实 GPU 脚本为 `verify-saltline`，不进 CI。其余内置应用的完整业务功能不在承诺内。 |
| Aiao Code       | 远程来源为 `vscode.aiao.io`，经 Orbit 隔离运行；就绪、失败重试、透明标题栏与迟到实例消息有检查。sandbox 不允许 OAuth 弹窗及 `showDirectoryPicker()`；应用自己的文件输入尚未验收。                                                                           | US-202～204；真实线上验收用 `verify-aiao-code`，同站项目及已有登录状态由 US-004 单独验收。              |
| 无障碍          | 菜单、Dock、启动台、聚焦搜索、Finder 与多窗口纯键盘路径及无障碍树进入冒烟；关闭和最小化时焦点立即交接。                                                                                                                                                     | US-108；真实 VoiceOver 逐步播报另按 [VOICEOVER.md](../apps/e2e/VOICEOVER.md) 验收。                     |
| 覆盖率与披露    | web statements 总体及逐文件 80% 门槛；核心变更同时有回归测试。About 的外网说明由[同一主机清单](../apps/web/src/app/shared/external-content.ts)生成，源码主机漏登记会令单测失败；Safari 阅读入口说明网址会发送给 `r.jina.ai`。                               | US-006、US-007；来源披露不代表外网显示效果已验收。                                                      |
| 工程与发布      | Nx 产品根、web、e2e 分离；生产密钥扫描；`deploy` 发布后逐文件对账。`inspect-live` 只读核对入口。                                                                                                                                                            | US-001～003、US-008；冒烟报告区分 `passed`（无清单外失败）与 `clean`（全部干净通过）。                  |
| 线上域名        | Pages 项目已登记 `desktop.aiao.io` 与 `aiao-desktop.pages.dev`。2026-11-14 两入口均为 200、无重定向、HTML 摘要一致并有 COOP/COEP；本轮没有发布。                                                                                                            | US-004；不据此推断项目、GitHub 登录或本地数据已迁移。                                                   |

## 浏览器支持

按用户明确要求及[D-19](decisions.md#d-19只验收桌面-chrome)，本轮唯一浏览器验收范围为桌面Chrome。正式构建自动回归使用Chromium，真实Chrome的高依赖能力记录单独注明环境；未完成的真实物理键盘和VoiceOver仍由各自故事保留。

| 环境                            | 当前验收范围与结果                                                                                    | 证据与边界                                                                                                                                                                                                                                                       |
| ------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 桌面 Chrome / Chromium 自动回归 | 本轮唯一必验范围；正式产物两轮24组、479项全部通过，核心文件、持久化、应用启动、编辑及宿主能力已有检查 | [第一轮](evidence/2026-11-14/chromium-browser-support-verify-2.json)、[第二轮](evidence/2026-11-14/chromium-browser-support-verify.json)；真实Chrome的游戏GPU、指针锁定与输入见[原始记录](evidence/2026-11-14/saltline-gpu-final-3.json)，版本及产物以各报告为准 |
| 390×844 与触屏仿真              | Chrome/Chromium 的最低限度核心交互：菜单、Dock、启动台、拖动、缩放与无横向溢出                        | 由两轮冒烟的 narrow-screen 组覆盖；不扩展为移动端真机承诺                                                                                                                                                                                                        |
| Firefox                         | 本轮非必验，不作产品支持承诺；已有自动化通过结果保留                                                  | [历史跨浏览器记录](evidence/2026-11-14/browser-support.md)，后续扩大范围时重新验收                                                                                                                                                                               |
| WebKit / 原生 Safari            | 本轮非必验，不作产品支持承诺；WebKit有限支持实验与Safari未完成观察保留                                | [历史复验](evidence/2026-11-14/browser-support.md)、[Safari后续记录](evidence/2026-11-14/safari-product-followup.json)、[再次游戏检查](evidence/2026-11-14/safari-game-probe.json)；未完成项没有改为通过                                                         |

## 快捷键

[desktop-page.ts](../apps/web/src/app/pages/desktop-page.ts) 处理页面收到的快捷键，⌘ 与 Ctrl 等价。Playwright 的按键不经过系统快捷键分发，不能证明真实键盘可用；[verify-keyboard.mjs](../apps/e2e/src/verify-keyboard.mjs) 必须由操作者手按并记录。当前物理键盘结论保持未验收。

| 组合       | 动作                                       | 可用的界面入口                          |
| ---------- | ------------------------------------------ | --------------------------------------- |
| ⌘K、⌘Space | 打开或关闭聚焦搜索；输入框里也生效。       | 菜单栏搜索按钮。                        |
| F4         | 打开或关闭启动台。                         | Dock 的 Launchpad。                     |
| Esc        | 关闭菜单、聚焦搜索、启动台或通知中心。     | 弹层外部或对应入口按钮。                |
| ⌘W         | 关闭前台窗口；输入框或可编辑区域里不生效。 | File → Close Window，或窗口关闭按钮。   |
| ⌘M         | 最小化前台窗口；同上。                     | Window → Minimize，或窗口黄色按钮。     |
| ⌘Q         | 退出前台应用；同上。                       | 应用菜单 → Quit。                       |
| `` ⌘` ``   | 循环窗口；同上。                           | Window → Cycle Through Windows。        |
| ⌘N         | 为前台应用新开窗口；同上。                 | File → New Window / New Finder Window。 |

不支持声明：数据只在当前浏览器的 Origin 下，没有账号、备份、导出或跨设备同步，换域名不自动迁移；TextEdit 新文档没有保存入口；配额不足、存储不可用、文件体与目录行写入中断等边界仍未完整验收。集成应用不能弹窗或调用受限文件句柄 API，iframe 获焦后桌面快捷键不生效。游戏需要 GPU，最小化后循环继续。真实外网的壁纸、地图、天气等显示效果与断网重载能力不在已完成验收中。已知限制详见[验收台账](verification-report.md#尚未证明)。
