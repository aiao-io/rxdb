# 2026-11-17 自动完成工作证据

## A01 文档保存与内容保护（ADESK-US-109）

基线：`2a3e4618369c325d2ea3d2fef8b95cbba697677f` 加本次未提交改动；浏览器报告记录了 dirty 工作区与产物 index SHA-256。北京时间 2026-11-17；JSON 的 measuredAt 使用 UTC 2026-11-16。环境：macOS darwin 27.2.0 arm64，Apple M1 Max，Node 26.12.0，headless Chromium 158.0.8127.18。

- `NX_NO_CLOUD=true pnpm nx test aiao-desktop-web`：95 个测试文件、1375 条用例通过；逐文件原覆盖率门槛通过，非 UI 的 TextDocument 新增到门槛范围。行 99.24%、分支 95.16%。见 [单测与覆盖率](document-unit-green.txt)。
- `NX_NO_CLOUD=true pnpm nx run-many -t lint typecheck -p aiao-desktop-web aiao-desktop-e2e --parallel=1`：零 lint 警告、类型检查通过。见 [日志](document-checks-green.txt)。
- `E2E_TRACE=1 NX_NO_CLOUD=true pnpm nx run aiao-desktop-e2e:e2e --group=document-workflow --report=/tmp/aiao-document-workflow-final.json`：15 项通过，包括另存后的窗口路径落库、刷新恢复与正文一致。见 [报告](document-workflow.json)、[日志](document-workflow-green.txt)。
- `E2E_TRACE=1 NX_NO_CLOUD=true pnpm nx run aiao-desktop-e2e:e2e --group=multi-tab --report=/tmp/aiao-document-multi-tab-final.json`：30 项通过。五轮并发编辑每轮恰有一次拒绝覆盖、两份草稿保留，显式重载后 64–65 ms 收敛；终端与顺序编辑语义保留。见 [报告](document-multi-tab.json)、[日志](document-multi-tab-green.txt)。
- 前一轮关联回归的 host-filesystem、a11y、window-layout、persistence、shell-interaction、apps 和 document-workflow 全绿；multi-tab 的旧自动丢弃草稿断言失败，改为上面的显式冲突检查后通过。保留 [原始报告](document-regression-before-concurrency-update.json)，不把失败报告改写为成功。

红阶段证据：[关闭协商](document-close-red.txt)、[迟到结果与读取失败](document-edge-red.txt)、[同毫秒版本](document-version-red.txt)、[重复重启](document-session-red.txt)。浏览器层证明合成输入与离页监听；物理键盘、真实读屏和浏览器强制杀进程后的内存草稿恢复不由这些结果证明。本轮尚未发布。

## A02 Finder 文件管理（ADESK-US-110）

同一基线 `2a3e46183` 加本次工作区改动；浏览器报告记录源状态、环境和产物摘要。当前 schema 升为 `2026111701`，上一版 `2026111301` 的文件、应用记录与偏好保留。schema 版本是单向升级，老构建会触发既有降级保护。

- `NX_NO_CLOUD=true pnpm nx run-many -t lint typecheck test requirements-check -p aiao-desktop-web aiao-desktop-e2e aiao-desktop --parallel=1`：1390 条 web 单测、逐文件 80% 覆盖率、lint/typecheck 与需求门禁通过，见 [门禁日志](finder-checks-green.txt)。
- `E2E_TRACE=1 NX_NO_CLOUD=true pnpm nx run aiao-desktop-e2e:e2e --group=file-management --report=/tmp/aiao-file-management-final.json`：15 项全绿、无页面错误。四视图、真实下载字节和文件名、无扩展名、零字节、重复导入、读取失败、分栏节点、复制快捷键、刷新后恢复、重名和原目录失效均有检查。见 [报告](finder-workflow.json)、[日志](finder-workflow-green.txt)。导入上限为每批 256 MiB，在读取前校验；新服务单测还覆盖写入失败撤回。
- `E2E_TRACE=1 NX_NO_CLOUD=true pnpm nx run aiao-desktop-e2e:e2e --group=disk-terminal,applications-protection,multi-tab,document-workflow,host-filesystem,window-layout --report=/tmp/aiao-file-management-related.json`：六组全绿，130.2 秒；终端、受保护应用包、五轮多页冲突、文档保存、宿主文件面板和布局恢复均保留。见 [报告](finder-related.json)、[日志](finder-related-green.txt)。
- a11y 完整组及新增 Rename / Open With / Restore 三种对话框的键盘、焦点、名称、axe（含新对话框的色彩对比）通过，见 [原始报告](finder-a11y-and-before-navigation-wait.json) 的 a11y outcome。同份报告的 file-management 当时因目录切换尚未完成便统计内容而失败，后增加目录标题和空列表等待，最终报告已通过。
- `upgrade-legacy` 的完整旧库、种子、四次启动中断回归通过，见 [原始报告](finder-legacy-and-before-dialog-fix.json) 的对应 outcome；该报告同时保留对话框尚未修复时的失败，不能当作整轮通过。`upgrade-protection` 的降级和旧标签页拒绝写入回归通过，见 [首轮报告](finder-before-fixture-fix.json) 的对应 outcome。
- `AIAO_DESKTOP_PREVIOUS_DIST=/tmp/aiao-pre-file-management-2026111301 NX_NO_CLOUD=true pnpm nx run aiao-desktop-e2e:e2e --group=upgrade-previous --report=/tmp/aiao-schema-check-red.json`：实际旧构建到当前构建六项通过，包含完整正文、应用数据、新版本记录、无效 JSON 元数据拒绝；文件名中的 red 是执行前预期，实际结果为通过。见 [旧构建标识](finder-previous-artifact.json)、[报告](finder-previous-schema.json)、[日志](finder-previous-schema-green.txt)。

红阶段：[操作模型](finder-operations-red.txt)、[持久原位置与迁移](finder-migration-red.txt)、[服务入口](finder-service-red.txt)、[应用选择](finder-open-with-red.txt)、[导入上限](finder-import-limit-red.txt)。本轮未发布。整批导入/复制遭遇进程中断的恢复仍属于 A03，当前已证明的是普通 I/O 失败撤回及源数据保留。


## A03 完整备份、恢复与存储健康（ADESK-US-111）

当前 schema `2026111702`，包含批次写协议门禁；基线仍为 `2a3e46183` 加未提交工作区。归档只接受相同 schema，历史版本先用匹配构建恢复再升级。旧构建 `2026111301` 的正式产物继续保留并用于真实升级验证。本轮未部署。

- `E2E_TRACE=1 AIAO_DESKTOP_PREVIOUS_DIST=/tmp/aiao-pre-file-management-2026111301 NX_NO_CLOUD=true pnpm nx run aiao-desktop-e2e:e2e --group=storage-faults,backup-storage,upgrade-protection,upgrade-previous,upgrade-legacy --report=/tmp/aiao-storage-final.json`：5 组全部通过，58 项（备份 14、故障 12、旧库 12、保护 14、旧构建 6），无页面错误，56.0 秒。见[报告](backup-storage.json)、[日志](backup-storage-green.txt)。包含不同 Origin 的文本/二进制/空文件/废纸篓原路径、Notes 与外观、导出与别页写入互斥；六种归档拒绝；恢复 Worker 写入配额失败/崩溃/半程关闭页面；导入复制中断清理；OPFS 健康失败；两类孤儿及缺体拒绝修复；磁盘卷与完整桌面重置中断继续、坏活动指针恢复、无关数据保留；键盘确认取消与 axe。
- `NX_NO_CLOUD=true pnpm nx run-many -t lint typecheck test requirements-check -p aiao-desktop-web aiao-desktop-e2e aiao-desktop --parallel=1`：1441 条 web 用例、逐文件原 80% 门槛、web/e2e lint/typecheck、脚本测试和需求门禁通过，见[日志](backup-checks-green.txt)。后续小修后的最终门禁中 web 1441 条、lint/typecheck、脚本与需求检查再次通过；公共适配器在同轮并发压力下超时，原日志与串行复验分开记录。
- 公共 `rxdb-adapter-sqlite-wasm` 完整套件：35 files、1086 passed、26 不适用 skipped；语句 96%、行 97.38%、分支 87.87%，原门槛通过，见[日志](backup-adapter-green.txt)。专用 Worker OPFS 完整备份共享套件包含各阶段强杀；产品 Worker 自己持有 OPFS 连接，无嵌套 Worker。
- 导入复制批次、服务集成和 schema 定向 103 条通过，见[日志](backup-batch-green.txt)。红阶段：[抹除协议](backup-erase-red.txt)、[抹除启动写保护](backup-erase-startup-red.txt)、[不完整磁盘拒绝恢复](backup-disk-state-red.txt)。
- [中途失败报告](backup-faults-before-reopen-wait.json)保留：前十项已通过，抹除后测试仍等待不应恢复的 Finder 窗口而超时；改为等待实际窗口恢复再主动启动 Finder 后，最终 5 组通过。没有放宽数据断言。

归档上限 256 MiB。备份和完整桌面抹除均不包含远程 Origin 应用、游戏 localStorage、终端运行时镜像、第三方凭据或已下载备份；完整抹除覆盖本产品全部保留代际，卷抹除保留应用记录和偏好。合成键盘和 axe 不证明真实物理键盘、读屏或人工 IME。


A03 关联回归：`document-workflow,file-management,multi-tab,host-filesystem,a11y,disk-terminal,window-layout` 中六组通过；Finder 在画廊快捷键处超时，见[原始报告](backup-related-before-finder-rerun.json)、[日志](backup-related-before-finder-rerun.txt)。同一产物单独复跑 `file-management` 15 项通过，见[报告](backup-finder-rerun.json)、[日志](backup-finder-rerun-green.txt)。`pnpm nx` 消费了本轮的 `--parallel=2`，实际 smoke 仍按默认 3 组并行；没有声称这轮为 2 组并行。

[最终门禁首次日志](backup-final-gates-before-adapter-serial.txt)保留公共适配器 4 文件 7 条 5000ms 超时，其余 1079 条通过；web 与 lint/typecheck/需求检查均通过。随后以 `--browser.fileParallelism=false` 复验公共包，结果另行归档，不改业务、不增加超时或降低门槛。


公共包串行复验通过：`NX_NO_CLOUD=true pnpm nx run rxdb-adapter-sqlite-wasm:test --browser.fileParallelism=false --output-style=static`，35 文件 1086 passed、26 不适用 skipped、原覆盖率门槛通过，见[日志](backup-adapter-serial-green.txt)。A03 已完成；后续应用目录与其他产品任务不由本节证明。


## A04 批准应用目录与版本管理（ADESK-US-207）

同一基线 `2a3e46183` 加当前未提交改动；未发布。正式 `approved-apps.json` 为空；浏览器生命周期使用正式产物的受控副本，只替换目录和编译批准摘要来模拟运营发布 1.0.0 → 2.0.0。这些不是线上真实发布版本。完整性校验、来源限制和权限判断均由产品代码执行，没有注入绕过授权的运行时入口。

- `NX_NO_CLOUD=true pnpm nx run-many -t lint typecheck test requirements-check -p aiao-desktop-web aiao-desktop-e2e aiao-desktop --parallel=1 --output-style=static`：web 113 文件、1481 条用例；逐文件原 80% 覆盖率门槛通过，总语句 97.96%、行 99.14%。web/e2e lint 零警告、typecheck、需求和脚本门禁通过，见[日志](catalog-gates-green.txt)。E2E 脚手架 57 条通过。
- `E2E_TRACE=1 NX_NO_CLOUD=true pnpm nx run aiao-desktop-e2e:e2e --group=approved-catalog,integrated-app,transparent-window,applications,applications-protection,dock,lazy-loading,window-layout,apps --report=/tmp/aiao-approved-catalog-regression.json --output-style=static`：9 组全部通过、无页面错误，实际并行 3。见[报告](catalog-regression.json)、[日志](catalog-regression-green.txt)。包括原有 Aiao Code、窗口、Dock、Applications、懒加载与全部内置应用启动。
- 关联回归构建出现一处 Angular 可空链诊断；已按类型收窄移除多余可空链。随后对当前正式构建执行 `--group=approved-catalog --report=/tmp/aiao-approved-catalog-final.json`，15 项全部通过、axe 无违规、无页面错误且无该编译警告，见[报告](catalog-lifecycle.json)、[日志](catalog-lifecycle-green.txt)。其余关联代码未改。
- 15 项覆盖：真实空状态；非法/重复项拒绝；同名用户条目保留；确认取消与四个入口；离线缓存和重开；更新与回退的入口/能力变化；跨页撤权；另一页继续编辑时两页草稿与原版本保留；用户文件和远程 Origin 数据保留；摘要不符拒绝；写入配额失败重试；页面/Worker 销毁后的投影日志恢复；损坏记录显式重置；固定项跨刷新与卸载清除；键盘焦点和三个面板的 axe。
- 远程协议不能报告未保存状态，因此每个已打开的可选应用窗口由用户确认关闭，未把“撤权”当作“草稿已保存”。共享运行锁释放后才提交版本；任一页拒绝、等待超时或发起页销毁都不提交。没有改公共 Orbit API。见[关闭确认截图](catalog-close-confirm.png)、[商店截图](catalog-ui.png)。
- schema 单向升至 `2026111703`，保护安装集及投影日志不被旧静态清单构建破坏。备份拒绝带未完成应用投影日志的库。应用卸载只退役系统元数据，包内用户文件保留；用户仍需自己管理远程站点的数据。

红阶段：[来源与撤权](catalog-origin-red.txt)、[数据库快照与确认过期](catalog-snapshot-red.txt)、[投影日志](catalog-journal-red.txt)、[操作流程](catalog-flow-red.txt)、[跨页关闭](catalog-close-red.txt)、[卸载固定项](catalog-dock-red.txt)。保留两次浏览器脚本失败：[焦点仍在 iframe 时直接调用桌面快捷键](catalog-before-host-focus.txt)、[取消后未等渲染并使用了匹配多个警告的选择器](catalog-before-alert-wait.txt)；最终改为真实桌面焦点和精确状态等待，没有放宽断言。

实际目录条目需要运营及发布方提供不可变版本入口，不能由此次自动工作虚构。浏览器合成键盘和 axe 仍不证明物理键盘、VoiceOver/NVDA 或人工 IME；A05～A09 不由本节证明。

A04 状态收尾后的需求门禁通过：26/27 已交付，唯一待评审故事仍为 US-108。修复的是状态总览必须保留的“进行中（0 条）”标题，见[收尾日志](catalog-closure-requirements-green.txt)。

## A05 运行状态与隐藏资源管理（US-112）

基线 `2a3e46183` 加未提交改动，未发布。本故事自动验收已完成；GPU 整组的环境限制保持，A05 总项仍未完成。

- [红阶段](runtime-red.txt)与[定向单测](runtime-unit-green.txt)：真实可见性模型、发布游戏内嵌桥接、音频失败与异步切换、加载前隐藏和用户暂停保留。
- [正式构建报告](runtime-browser.json)、[日志](runtime-browser-green.txt)：`runtime-activity,game` 两组通过，无页面错误；真实活动监视器 9 项、游戏 17 项检查。监视器[截图](runtime-activity-ui.png)已目视检查。游戏窗口基本鼠标/键盘交互由替身覆盖，真实游戏检查启动、帧计数停止与恢复、音频暂停状态、保留 iframe 身份。软件 WebGL 这段通过派发 DOM 点击执行宿主操作，不冒充物理输入。
- 保留[首次显示/还原焦点失败](runtime-before-show-fix.txt)：修复监视器在还原完成前调用聚焦的错误。[软件 WebGL 原生点击超时](runtime-before-software-input.txt)通过测试输入方式处理，帧计数和音频断言保持。
- 本机 GPU 诊断历史：[第一次可见性超时](runtime-gpu-before-visibility.txt)、[默认焦点模拟下的报告](runtime-gpu-before-native.json)、[日志](runtime-gpu-before-native.txt)保留。当前安装 Playwright 1.65 的主页面默认调用 `Emulation.setFocusEmulationEnabled(true)`，会影响真实隐藏/焦点检查；后续改用专用临时 Chrome 配置和 CDP `noDefaults`，不连接用户的日常配置。

A05 的离线资源、Aiao Code 协作与其他自动任务不由此节证明。

US-112 收尾证据：

- [运行状态及关联回归](runtime-regression-before-game-wait.json)中的 runtime-activity、document-workflow、shell-interaction、apps、lazy-loading、window-layout、a11y 七组通过。game 当时因软件 WebGL 采样超时，保留[再次失败](runtime-game-before-pause-observer.json)；改为在游戏文档内订阅暂停事件、跨 600 ms 取帧计数后，[后续报告](offline-before-focus-wait.json)的 game 17 项通过，没有降低循环停止、音频与文档身份断言。
- [专用 Chrome GPU 报告](runtime-gpu-loginwindow.json)中真实最小化、锁屏、睡眠、标签隐藏与恢复通过。硬件 Apple M1 Max，98.6 FPS 只代表本次测量。`pointerLocked=false`，Chrome `active=false`、前台 PID 451 为 loginwindow，整组不通过，不代替用户解锁或声称物理输入通过。
- [运行状态阶段门禁](runtime-gates-green.txt)：1492 条用例；合入天气地图改动后的[最终门禁](offline-gates-green.txt)：1519 条、116 files，statements 97.94%、branches 94.7%、functions 98.04%、lines 99.16%，原逐文件 80% 门槛、lint/typecheck 与需求门禁通过。

## A05 本地壁纸与真实天气地图状态（US-113）

2026-11-17，基线 `2a3e46183` 加未提交工作区，schema 仍为 `2026111703`，未发布。

- 红阶段保留[天气](offline-weather-red.txt)、[资源](offline-resources-red.txt)；[定向单测](offline-resources-unit-green.txt)64 条通过（天气 27、地图搜索 13、壁纸 14、外网清单 10）。
- `E2E_TRACE=1 NX_NO_CLOUD=true pnpm nx run aiao-desktop-e2e:e2e --group=offline-resources --report=/tmp/aiao-offline-resources-green.json --output-style=static`：[最终 8 项报告](offline-resources-green.json)与[日志](offline-resources-green.txt)全绿、无页面错误。包含无虚构读数、响应校验、共享请求、来源与取得时间、陈旧保留及重试恢复、地图瓦片/搜索失败恢复、键盘和 axe。
- PWA、a11y、lazy-loading 三组在[关联报告](offline-before-cold-map.json)通过；PWA 用真实 Service Worker 和实际断网检查六张完整图的首次切换、六张缩略图解码及无 Unsplash 请求。该报告 offline-resources 重开地图的失败保留：成功瓦片已在页内加载，不能用重开窗口保证再次触发网络失败。将失败态键盘检查放在首次成功加载之前，最终单组报告通过。
- [首轮四组全绿](offline-first-green.json)仍保留，但目视截图发现天气按钮白字浅底；axe [未发现此问题](weather-axe-missed-contrast.json)。新增实际颜色对比检查得到[1.07:1 失败](weather-contrast-red.json)，修复为系统文字色后通过 4.5:1 门槛。[最新天气截图](weather-stale-ui.png)、[断网壁纸截图](wallpapers-offline-ui.png)、[壁纸总览](wallpaper-contact.png)已目视核对。
- [最终门禁](offline-gates-green.txt)全部通过；[上一轮 Maps 成员顺序 lint 失败](offline-before-member-order.txt)保留，方法顺序已修正。天气和地图成功响应是受控夹具，不称真实天气或外网地图验收。

US-112 与 US-113 关闭后，Angular 当前 28/29 Done，唯一 In Review 为 US-108；Aiao Code 协作与总计划 A05～A09 仍未完成。

状态关闭后的需求门禁与 e2e lint 通过，见[收尾日志](runtime-offline-closure-green.txt)。


## A05 Aiao Code 显式文件复制（ADESK-US-208 / US-412）

2026-11-17，基线 `2a3e46183` 加未提交工作区，未发布。复用现有 Orbit 协议，不共享存储，也不扩大 sandbox。单文件和项目 ZIP 每次最多 512 KiB，导出每次经过保存面板；普通工作台保存不写回桌面原文件。桌面故事按产品约定完成 AC；应用侧 US-412 按根规范保持 In Review，等待评审合并。

- `NX_NO_CLOUD=true pnpm nx run aiao-vscode:coverage --output-style=static -- --maxWorkers=2`：[完整单测日志](aiao-code-copy-coverage.log)，84 文件、1295 条通过；[覆盖率摘要](aiao-code-copy-coverage-summary.json) statements 91.29%、branches 83.21%、functions 91.28%、lines 94.20%。复制适配器和项目归档均四项 100%。
- `NX_NO_CLOUD=true pnpm nx run-many -t lint typecheck -p aiao-vscode --parallel=1 --output-style=static`：[最新 lint/typecheck](aiao-code-copy-lint-types-final.log)通过。`NX_NO_CLOUD=true pnpm nx run-many -t lint typecheck test requirements-check -p aiao-desktop-web aiao-desktop-e2e aiao-desktop --parallel=1 --output-style=static`：[桌面门禁](aiao-code-copy-desktop-gates-final.log)通过，web 1519 条；旧白名单与派生视图的[失败日志](aiao-code-copy-desktop-gates.log)保留。
- `E2E_TRACE=1 NX_NO_CLOUD=true pnpm nx run aiao-desktop-e2e:e2e-aiao-code-files --report=/tmp/aiao-code-copy-browser-final.json --output-style=static`：[最终报告](aiao-code-copy-browser-final.json)、[日志](aiao-code-copy-browser-final.log)，10 项全部通过、无页面错误、16.8 秒。覆盖真实构建与独立存储、本机文件夹输入、单文件字节与草稿保留、取消和重名、项目 ZIP 往返、坏包和超限、嵌入登录限制、独立访问回归、关闭取消面板、未授权提示。
- `E2E_TRACE=1 NX_NO_CLOUD=true pnpm nx run aiao-desktop-e2e:e2e --group=host-capabilities,host-filesystem,integrated-app,transparent-window,window-layout,lazy-loading --report=/tmp/aiao-code-copy-regression.json --output-style=static`：[6 组关联报告](aiao-code-copy-regression.json)、[日志](aiao-code-copy-regression.log)全部通过，无页面错误，76.7 秒。
- 两个应用都使用本地正式产物；浏览器把 `https://vscode.aiao.io` 请求转到本地产物服务器，[工作台构建摘要](aiao-code-copy-build.json)。不是线上发布验证。菜单和面板通过浏览器操作，项目及字节检查部分由既有 workbench-verify 入口访问真实 session/OPFS 后端。关闭等待中面板用应用按钮的 DOM 事件验证，不冒充物理点击或人工键盘。[正常菜单](aiao-code-copy-enabled-ui.png)、[拒绝状态](aiao-code-copy-ui.png)已目视检查。
- TDD 原始记录：[适配器完整红日志](aiao-code-copy-unit-red-full.log)、[绿日志](aiao-code-copy-unit-green.log)；[UI 红日志](aiao-code-copy-ui-red.log)、[后续 177 条通过](aiao-code-copy-ui-rerun.log)；文件名带 green 的 [UI 中间日志](aiao-code-copy-ui-green.log)实际失败，原因是无效 ZIP 夹具及未等 busy 结束，不能当成功证据；[目录选择器清理红日志](aiao-code-folder-picker-red.log)、[嵌入后台焦点红日志](aiao-code-copy-focus-red.log)的失败均已修复。
- 浏览器迭代失败保留：[关闭选择器不唯一](aiao-code-copy-browser-first.json)、[清理中在途请求被中断](aiao-code-copy-browser-second.log)、[重开焦点/宿主遮罩失败](aiao-code-copy-browser-third.json)。正式代码修复后台 iframe 恢复时抢焦点；夹具等待真实工作台 ready 并先关闭页面、再结束路由及服务器，不放宽运行时错误检查。[早期 9 项绿报告](aiao-code-copy-browser-fourth.json)由最终 10 项报告补充。

真实 GitHub 账号授权与线上发布没有验收；嵌入只承诺 PAT 路径的受控客户端成功/失败、OAuth 不可用提示。构建仍有 initial 预算及 ms CommonJS 警告，留给 A08 核查，不称构建零警告。US-108 人工读屏和 GPU 鼠标锁定边界保持。A06～A09 仍未完成。

A05 收尾后的[需求门禁](aiao-code-copy-closure-requirements.log)通过：29/30 Done，剩余 US-108 人工读屏。


## A06 内置内容复制与打印（US-114）

基线 `2a3e46183` 加未提交工作区，未发布。Preview 的文本 PDF 复制全文、图片复制文件名，Mail 复制实际邮件文本，Photos 复制图片地址；入口明确复制对象。Preview 与 Mail 请求浏览器打印所选内容，不声称已经输出纸张。

- [最初红阶段](aiao-content-actions-red.log)与[14 条定向通过](aiao-content-actions-unit.log)。[第一次类型/lint失败](aiao-content-actions-types-lint.log)来自测试替身 Promise 返回类型及未用参数，已修正，没有放宽规则。
- [第一次浏览器失败](aiao-content-actions-browser-first.json)暴露图标按钮缺显式 aria-label；[第二次失败](aiao-content-actions-browser-second.json)中实际剪贴板与键盘菜单已通过，但 Enter 执行命令后会再次激活归还焦点的按钮。MenuList 的 Enter 改用已有的 preventDefault 路径，随后 [10 项通过](aiao-content-actions-browser-third.json)。
- 目视发现旧成功 toast 在后一次失败时残留、错误栏透明。[反馈红阶段](aiao-content-actions-feedback-red.log)保留 3 条失败，修复为立即显示失败 toast 与实色错误栏；最终[菜单](aiao-content-actions-menu.png)及[失败状态](aiao-content-actions-error.png)已目视核对。
- `NX_NO_CLOUD=true pnpm nx run-many -t lint typecheck test requirements-check -p aiao-desktop-web aiao-desktop-e2e aiao-desktop --parallel=1 --output-style=static`：[最终门禁](aiao-content-actions-gates-final.log)通过，118 文件 1534 条；[覆盖率](aiao-content-actions-coverage.json)语句 97.89%、分支 94.74%、函数 97.88%、行 99.09%，原逐文件 80% 门槛保持。
- `E2E_TRACE=1 NX_NO_CLOUD=true pnpm nx run aiao-desktop-e2e:e2e --group=content-actions,apps,host-capabilities,host-filesystem,a11y,shell-interaction --report=/tmp/aiao-content-actions-browser-final.json --output-style=static`：[最终报告](aiao-content-actions-browser-final.json)、[日志](aiao-content-actions-browser-final.log)，6 组全绿、无页面错误，85.4 秒。包括新增 10 项、全部应用启动、宿主能力/文件面板与共享菜单键盘回归。

复制成功路径实际读回浏览器系统剪贴板。拒绝路径用受控 NotAllowedError，打印失败也受控注入；成功打印调用原生 print 并确认真实 beforeprint 事件，同时检查隔离文档内容和资源释放。未验证系统打印机、纸张、真实权限提示交互或物理键盘。Mail 的真实发送、Photos 二进制图片复制、Preview 视频与 A06 其余工作仍未完成。

US-114 收尾后的[需求门禁](aiao-content-actions-closure.log)通过：30/31 Done，US-108 人工读屏保留。


## A06 提醒事项草稿保护（US-115）

基线仍为 `2a3e46183` 加本次未提交工作区；schema `2026111703` 未变。本轮未发布。

- `NX_NO_CLOUD=true pnpm nx run aiao-desktop-web:test --coverage.enabled=false src/app/apps/reminders/reminder-drafts.spec.ts`：[初始红阶段](aiao-reminder-drafts-red.log)、[原模型绿阶段](aiao-reminder-drafts-unit.log)、[错误文案红阶段](aiao-reminder-feedback-red.log)、[最终十条绿阶段](aiao-reminder-feedback-green.log)。
- `NX_NO_CLOUD=true pnpm nx run-many -t test lint typecheck requirements-check -p aiao-desktop-web aiao-desktop --parallel=1 --output-style=static`：[最终门禁](aiao-reminder-drafts-final-gates.log)全绿，119 文件/1544 条单测。[覆盖率](aiao-reminder-coverage.json)：语句 97.88%、分支 94.74%、函数 97.86%、行 99.10%；逐文件 80% 门槛通过。此前 UUID 类型错误的[失败日志](aiao-reminder-drafts-gates.log)与[修复复跑](aiao-reminder-drafts-types.log)保留。
- `E2E_TRACE=1 NX_NO_CLOUD=true pnpm nx run aiao-desktop-e2e:e2e --group=reminder-drafts,persistence,apps,shell-interaction,document-workflow --report=/tmp/aiao-reminder-drafts-browser-fourth.json --output-style=static`：[最终报告](aiao-reminder-drafts-browser-fourth.json)、[日志](aiao-reminder-drafts-browser-fourth.log)。五组通过，51.9 秒，无页面错误；新增九项检查通过。
- 真实 SQLite INSERT/UPDATE 触发器失败、持有真实写锁、恢复后稳定 ID 单条记录、关闭/重启阻止丢草稿、显式丢弃与软件键盘重开均有证据。beforeunload 为合成事件；axe 与自动键盘不替代物理输入或 VoiceOver。
- [失败界面截图](aiao-reminder-failure.png)已目视检查；原始 SQL 改为简短操作提示，未横向溢出。
- 前三次浏览器检查均未通过，保留完整报告和日志：第一、二次为新输入尚未渲染时测试选中旧输入，修复为等待唯一新 ID；[第二次](aiao-reminder-drafts-browser-second.json)明确显示两个变量曾指向同一条。第三次 reload helper 主动关窗后测试未重开，已补重开；[第三次](aiao-reminder-drafts-browser-third.json)。最终联跑验证这些修复，不将前次失败算作通过。

固定侧栏统计和日期筛选不在 US-115 范围，留在 A06 台账中继续。

US-115 收尾[需求门禁](aiao-reminder-closure.log)通过：31/32 Done，US-108 人工读屏保留。
