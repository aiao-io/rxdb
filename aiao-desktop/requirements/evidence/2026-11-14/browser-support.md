# WebKit 宿主剪贴板读取的有限支持（2026-11-14）

本文保留D-19之前的跨浏览器实现和验收过程。用户现已明确要求“只验收 chrome 就够了”；[当前范围](../../decisions.md#d-19只验收桌面-chrome)已收敛为桌面Chrome，Safari、Firefox、WebKit的历史结果或未完成观察不再构成本轮必验条件，也不改写成通过。当前US-005及待验计数见[范围调整记录](chrome-only-scope.json)。

原生 Safari 27.2 的[最小页面记录](safari-native-clipboard.json)显示：安全且跨源隔离的两来源页面里，固定文本写入与宿主直接读取成功；经 MessagePort 请求读取返回 NotAllowedError，发生时宿主有焦点且用户激活有效。该最小实验不能替代完整 Safari 产品验收。

产品在集成应用创建能力上下文时，根据 WebKit 引擎限制撤下 clipboard:read。握手公告和实际请求授权共用同一份有效能力；窗口在应用加载前就持续显示禁用原因，独立于几秒后消失的错误提示。窗口、剪贴板写入、文件面板等能力继续按原清单授权。浏览器的直接剪贴板读取不被替换，也不通过读取用户内容来探测支持。

实现见[支持策略](../../../apps/web/src/app/services/browser-app-support.ts)、[应用上下文](../../../apps/web/src/app/services/app-context.ts)、[远程会话](../../../apps/web/src/app/services/remote-app-session.ts)和[窗口入口](../../../apps/web/src/app/apps/web-app/web-app.html)。

[单测红记录](browser-support-unit-red-detail.txt)保留原会话没有限制状态的失败；[定向绿记录](browser-support-unit-green.txt)的104个用例验证策略、实际工厂授权和握手一致性。后续增加的 iOS WebKit 识别用例已随完整聚合通过。非默认引擎的新产物完整轮次另行记录，不能据定向结果声称全部验收通过。

原成功读取检查 hostCapabilities.clipboardReadAfterGrant 仍保留，不会把禁用当成读取成功。新增检查分别验证：能力公告符合浏览器边界、调用前已有可见原因、说明持续显示。WebKit 的已知限制必须同时满足这些产品检查，才能交付有限支持。

当前候选入口 SHA256 为 `2f142ced7f1617a3463d1c008c5e0f8b5836934b8d4bf16b5df2248fa6ec873c`。[WebKit 定向报告](webkit-support-checks.json)的 25 项中，24 项通过，保留的成功读取项为 false；新增三项入口检查全部通过，没有清单外失败或页面错误。[原始日志](webkit-support-checks.txt)保留 CAPABILITY_DENIED，不改写为读取成功。

[正式构建](browser-support-build.txt)和[类型检查](browser-support-typecheck.txt)通过；[新产物体积对照](initial-comparison-browser-support.json)为 raw 1,204,287 字节、gzip 384,380 字节，相对阶段 A 前分别减少 552,245 和 141,091 字节。它仍属于实现后回溯测量，不关闭历史基线流程条款。[发布演练](deploy-dry-run-browser-support.txt)通过，97 个文件、13.2 MB，没有上传。

[Firefox 串行复现](firefox-support-focus-checks.json)中无障碍 64 项通过；缩放检查改为可信点击后，暴露出第一窗口被第二窗口遮住，原合成点击绕过了这个条件。后续先通过窗口循环快捷键把第一窗口提到前台，再作相同的缩放与 3 像素几何比较，不通过强制点击或放宽几何断言处理。最初一次带逗号的参数被 Nx 拆分，浏览器未启动，单独保留[调用错误](firefox-support-focus-args-error.txt)，不计为产品测试结果。

## 当前源码的完整聚合门禁

[第三次完整聚合日志](verify-browser-support-3.txt)通过，退出码 0，含聚合根目标在内 56 个任务，命令包装器实测 347.906 秒。web 为 92 个测试文件、1348 个用例，e2e 脚本为 53 个用例；默认 Chromium 24 组、479/479 个检查键通过，冒烟 301.4 秒。[检查对象](chromium-browser-support-verify.json)从日志原样提取，不生成日志未输出的逐组 outcomes。[执行元数据](verify-browser-support-3-metadata.json)保留开始和结束 SHA、真实工作区修改与命令；不声明工作区干净。[覆盖率](coverage-summary-browser-support.json)为语句 98.61%、行 99.31%、函数 98.82%、分支 95.35%，新增支持策略四项均为 100%。

[首次完整聚合失败](verify-browser-support.txt)保留：懒加载组计数小组件四张表时同时创建四条临时 SQLite 连接，工作线程初始化抛出 NotFoundError。它输出了 465 个通过键，另缺 14 个懒加载键，不能算成 479 项通过，见[原始检查对象](chromium-browser-support-failed.json)。未修改产品数据库并发行为；夹具改为一条连接依次计数，仍要求四张表都非空，不重试、不增加等待、不吞异常。

新增夹具测试的[红记录](lazy-counts-unit-red.txt)与[绿记录](lazy-counts-unit-green.txt)验证连接复用、零行保留、表名引用与失败清理。lint 首次指出替身空方法，[失败](lazy-counts-lint.txt)与[补齐方法断言后的通过](lazy-counts-lint-green.txt)分别保留，没有忽略规则。[第一轮](lazy-counts-chromium-1.json)、[第二轮](lazy-counts-chromium-2.json)、[第三轮](lazy-counts-chromium-3.json)定向均为 14/14，且无页面错误。

Firefox 的[后续窗口布局报告](firefox-support-focus-2.json)为 51/51，原始输出见[日志](firefox-support-focus-2.txt)。先将目标窗口提到前台，再进行可信点击，原 3 像素几何容差不变。

## 新产物跨浏览器连续复验

四轮使用相同入口摘要，按 Firefox 两轮、WebKit 两轮依次执行，避免系统剪贴板组跨引擎相互覆盖。[第一批执行清单](browser-support-runs.json)与[WebKit后续清单](browser-support-webkit-followup-runs.json)记录真实命令、时间、退出码和日志路径；[汇总](browser-support-summary.json)逐份校验产物、24 个组、479 个检查键、缺项、页面错误与已知限制。旧产物成功轮没有拼接进本次连续两轮。

| 完整报告                                        | 浏览器版本 | 通过键  | passed | clean | 已知限制 | 页面错误 | 秒      |
| ----------------------------------------------- | ---------- | ------- | ------ | ----- | -------- | -------- | ------- |
| [firefox 第 1 轮](firefox-support-final-1.json) | 159.0      | 479/479 | true   | true  | 0        | 0        | 425.009 |
| [firefox 第 2 轮](firefox-support-final-2.json) | 159.0      | 479/479 | true   | true  | 0        | 0        | 448.302 |
| [webkit 第 2 轮](webkit-support-final-2.json)   | 27.2       | 478/479 | true   | false | 1        | 0        | 374.902 |
| [webkit 第 3 轮](webkit-support-final-3.json)   | 27.2       | 478/479 | true   | false | 1        | 0        | 394.576 |

Firefox 两轮均为 479/479、passed=true、clean=true。WebKit 两轮均为 478/479、passed=true、clean=false，唯一保留的是原成功读取检查 `hostCapabilities.clipboardReadAfterGrant`。能力公告、调用前入口原因与持续说明三项新检查均通过；实际读取请求返回 CAPABILITY_DENIED，不触碰系统读取，剪贴板写入与内容核对继续通过。无缺项、无清单外失败、无页面错误，不把有限支持改写成原读取能力已成功。

US-005 #1 的有限支持交付条件及 #5 按 #1 支持分档的连续两轮验收据此通过；只写“本次两轮未出现 flake”，不声称没有时序缺陷。此前 Firefox 抹盘前置条件、窗口遮挡、Finder 超时和本轮 Chromium 夹具失败全部保留。#4 仍保留：原生 Safari 已补入口、真实 Aiao Code 加载、文本编辑保存与刷新恢复，但终端与游戏等高依赖能力尚未完整复验，不声明 Safari 完整支持。

[WebKit 首次完整轮](webkit-support-final-1.json)为477/479：新限制说明条占据窗口顶端，旧透明窗口断言仍要求iframe直接贴顶。修为说明条贴顶、iframe恰好紧随其实际高度；其他引擎仍直接贴顶，原2像素容差不变。三引擎透明窗口定向各10/10后，当前完整聚合与WebKit第二、第三轮通过。首次失败报告和原始日志保留；Firefox完整两轮先于这一夹具几何调整，产品产物逐字节相同，更新后的Firefox定向也10/10通过。

## 原生 Safari 产品界面补证

[原生 Safari 记录](safari-product-entry.json)使用新建独立普通窗口和新的 loopback 来源，入口逐字节对应本轮产物，[响应头](safari-product-static-headers.txt)具备 COOP/COEP。没有运行页面注入脚本、读取剪贴板或接受权限提示。真实 Aiao Code 加载到其线上工作台，读取禁用原因在加载前和加载后均可见。

只在这份新的验收来源里修改种子文本 prasenx.txt，实际观察正文为 DESK-SAFARI-EDIT-20261114；关闭重开与浏览器刷新后正文一致，TextEdit 窗口也恢复。CUA 请求输入的首字母 A 没有出现在实际正文，记录保留真实观察值，不把请求内容写成已输入。

前一轮终端停在 Starting local shell with Vivari…，当时没有 shell 提示或文件创建结果。后续使用同一正式产物、独立普通窗口和该验收来源的[原生 Safari 记录](safari-product-followup.json)补齐了终端证据：提示符和 SAFARI_READY 输出可见，echo 创建的 safari-native-terminal.txt 经 cat、TextEdit 和浏览器刷新后均读回 SAFARI_TERMINAL_20261114。首次 printf 不被此 shell 提供，产生空文件及 not found；失败尝试没有计作成功。部分中间截图未显示已提交命令的输出，后续观察才读到完整输出，不据此编造启动时间或根因。

游戏从启动台打开同源 saltline.html，标题控件、真实 3D 港区与任务 HUD、暂停和继续控件均有实际观察。暂停说明出现“鼠标捕获不可用”，指针锁定及完整输入路径仍未证实，不能把它推广为 Safari 的普遍限制。原生 Inspector 在观察时没有可见错误，检查开始于游戏启动后，不替代全流程错误采集。曾尝试只读状态表达式，但没有取得返回值，未用于验收结论；“模拟用户手势”始终关闭。随后工具报告用户改变 Safari，重新观察为起始页后即停止 GUI 操作。只停止本次 51384 服务，既有 4411 服务保留。完整页面错误检查和其他核心路径仍未补齐，US-005 #4继续保留，CUA按键也不构成物理键盘验收。

第二次聚合在透明窗口断言调整前已通过，记录仍见[日志](verify-browser-support-2.txt)与[当时检查对象](chromium-browser-support-verify-2.json)，不覆盖历史测量。

### 再次原生游戏检查

[本轮记录](safari-game-probe.json)继续使用相同入口指纹。内嵌游戏的标题控件已出现且在开始操作后消失，但截图仍显示“准备就绪”遮罩，原生点击与 Escape、P 未建立可见响应；独立打开 saltline.html?bench=1 也未观察到画面或性能数据。只读 Console 查询与 Sources 的 window.__ready 监视都没有取得返回值；没有读取结果就不填写 ready、fatal、errors、pointerLock 或 FPS。调试器显示“暂停执行脚本”，单步控件禁用，未观察到处于暂停状态。

本轮检查时控制台没有可见错误，但 Inspector 虽在启动前打开，中途关闭后才重开，仍不构成全流程错误采集。清理前主窗口变为不同 UUID 的起始页，未确认变化原因，即停止 GUI；未继续关闭窗口或标签页。仅停止本轮 51384 服务，退出码 130、端口已释放。此前已观察到的 3D 场景、暂停/继续及终端成功记录不撤销，本轮异常也不隐去；没有建立浏览器通用限制或产品根因，不据此禁用游戏。US-005 #4保持保留。
