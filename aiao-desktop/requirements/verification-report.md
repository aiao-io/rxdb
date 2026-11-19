# Aiao Desktop 验收台账

## 2026-11-18：Settings 分区搜索（ADESK-US-127）

ADESK-US-127 自动验收完成：Settings 本地分区支持按名称搜索，空结果和清空恢复可用，点击结果后右侧标题与面板跟随选择。各面板完整系统 API、远程账号、权限中心和跨设备同步仍未接入。

- `pnpm nx run aiao-desktop-web:test -- --coverage.enabled=false --run src/app/apps/settings/settings-data.spec.ts`：Settings 搜索模型 3 条用例通过。
- `pnpm nx run aiao-desktop-web:typecheck` 和 `pnpm nx run aiao-desktop-e2e:lint`：通过。
- `pnpm nx run aiao-desktop-e2e:e2e --args='--group=settings-workflow --parallel=1 --report=../../requirements/evidence/2026-11-17/aiao-settings-workflow-green.json'`：5 项全绿，`initialSections`、`searchesBySection`、`emptySearch`、`clearsSearch` 和 `sectionFollowsSelection` 均为 `true`，无页面错误；报告见[证据](evidence/2026-11-17/aiao-settings-workflow-green.json)。

本次 E2E target 依赖任务已完成生产构建；本轮未发布。

- 最终无警告生产构建上的三组搜索回归：`pnpm nx run aiao-desktop-e2e:e2e --args='--group=stocks-workflow --group=fontbook-workflow --group=settings-workflow --parallel=1 --report=../../requirements/evidence/2026-11-17/aiao-search-workflows-final.json'`，17 项全部通过，报告见[证据](evidence/2026-11-17/aiao-search-workflows-final.json)。

## 2026-11-18：Font Book 字体族搜索（ADESK-US-126）

ADESK-US-126 自动验收完成：Font Book 本地字体族支持按名称搜索，空结果和清空恢复可用，筛选后详情标题与示例文字跟随当前字体。系统字体安装、删除和冲突管理仍未接入。

- `pnpm nx run aiao-desktop-web:test -- --coverage.enabled=false --run src/app/apps/font-book/font-book-data.spec.ts`：Font Book 搜索模型 3 条用例通过。
- `pnpm nx run aiao-desktop-web:typecheck` 和 `pnpm nx run aiao-desktop-e2e:lint`：通过。
- `pnpm nx run aiao-desktop-e2e:e2e --args='--group=fontbook-workflow --parallel=1 --report=../../requirements/evidence/2026-11-17/aiao-fontbook-workflow-green.json'`：5 项全绿，`initialFamilies`、`searchesByFamily`、`emptySearch`、`clearsSearch` 和 `detailFollowsSelection` 均为 `true`，无页面错误；报告见[证据](evidence/2026-11-17/aiao-fontbook-workflow-green.json)。

本次 E2E target 依赖任务已完成生产构建；本轮未发布。

## 2026-11-18：Stocks 本地搜索与演示数据声明（ADESK-US-125）

ADESK-US-125 自动验收完成：Stocks 本地自选股支持按代码或公司名搜索，空结果和清空恢复可用，筛选后详情跟随当前股票；页面明确显示 `Demo data · No live market feed`，推算的 Open、High、Low 标为 demo。实时行情、交易和远程同步仍未接入。

- `pnpm nx run aiao-desktop-web:test -- --coverage.enabled=false --run src/app/apps/stocks/stocks-data.spec.ts`：Stocks 搜索模型 3 条用例通过。
- `pnpm nx run aiao-desktop-web:typecheck`、`pnpm nx run aiao-desktop-web:lint` 和 `pnpm nx run aiao-desktop-e2e:lint`：全部通过。
- `pnpm nx run aiao-desktop-e2e:e2e --args='--group=stocks-workflow --parallel=1 --report=../../requirements/evidence/2026-11-17/aiao-stocks-workflow-green.json'`：7 项全绿，`initialWatchlist`、`searchesBySymbol`、`searchesByCompany`、`emptySearch`、`clearsSearch`、`detailFollowsSelection` 和 `declaresDemoData` 均为 `true`，无页面错误；报告见[证据](evidence/2026-11-17/aiao-stocks-workflow-green.json)。

本次 E2E target 依赖任务已完成生产构建；本轮未发布。

## 2026-11-18：Freeform 笔迹保存与失败保护（ADESK-US-124）

ADESK-US-124 自动验收完成：Freeform 画笔输入真实写入 SQLite；INSERT 失败时错误可见且失败笔迹保留，Retry 可恢复写入；DELETE 失败时原画板保留，Retry 可恢复清空；刷新后已保存笔迹继续存在。

- `NX_NO_CLOUD=true pnpm nx run aiao-desktop-web:test --coverage.enabled=false src/app/apps/freeform/freeform-ink.spec.ts --output-style=static`：Freeform 笔迹状态单测通过。
- `NX_NO_CLOUD=true pnpm nx run aiao-desktop-web:typecheck --output-style=static`、`NX_NO_CLOUD=true pnpm nx run aiao-desktop-web:lint --output-style=static` 和 `NX_NO_CLOUD=true pnpm nx run aiao-desktop-e2e:lint --output-style=static`：全部通过。
- `NX_NO_CLOUD=true pnpm nx run aiao-desktop-web:build --configuration=production --output-style=static`：正式构建通过。
- `E2E_TRACE=1 NX_NO_CLOUD=true pnpm nx run aiao-desktop-e2e:e2e --group=freeform-workflow --parallel=1 --report=/tmp/aiao-freeform-workflow-green.json --output-style=static`：6 项全绿，`strokePersists`、`failedInsertKeepsStroke`、`retryPersistsStroke`、`failedClearKeepsStrokes`、`retryClearsStrokes` 和 `survivesReload` 均为 `true`，无页面错误；归档报告见 [aiao-freeform-workflow-green.json](evidence/2026-11-17/aiao-freeform-workflow-green.json)。

本地 Freeform 单画板范围已关闭；橡皮擦、选区、撤销/重做、图层、协作、导出、云端同步和远程账号仍未接入。

## 2026-11-18：备忘录新建文件夹（ADESK-US-123）

ADESK-US-123 自动验收完成：Notes 支持通过侧栏按钮或 File 菜单新建用户文件夹，目录真实写入 SQLite；选中自定义目录后新建笔记归属正确，重复名称被拒绝，刷新后目录和笔记继续存在；schema 升至 `2026111802`，旧库由 RxDB 补建 `desktop$note_folder`。

- `NX_NO_CLOUD=true pnpm nx run aiao-desktop-web:test --coverage.enabled=false src/app/apps/notes/notes-model.spec.ts src/app/data/schema-version.spec.ts src/app/data/schema-fingerprint.spec.ts --output-style=static`：模型、schema 和指纹检查通过；随后使用 `UPDATE_SCHEMA_SNAPSHOT=1` 更新实体指纹快照。
- `NX_NO_CLOUD=true pnpm nx run aiao-desktop-web:typecheck --output-style=static`、`NX_NO_CLOUD=true pnpm nx run aiao-desktop-web:lint --output-style=static`、`NX_NO_CLOUD=true pnpm nx run aiao-desktop-e2e:lint --output-style=static` 和生产构建通过。
- `E2E_TRACE=1 NX_NO_CLOUD=true pnpm nx run aiao-desktop-e2e:e2e --group=notes-folders --parallel=1 --report=/tmp/aiao-notes-folders-green.json --output-style=static`：4 项全绿，`folderPersists`、`noteUsesFolder`、`duplicateNameIsRejected` 和 `folderSurvivesReload` 均为 `true`，无页面错误；归档报告见 [证据](evidence/2026-11-17/aiao-notes-folders-green.json)。

## 2026-11-18：提醒事项列表筛选与动态统计（ADESK-US-122）

ADESK-US-122 自动验收完成：Reminders 五个侧栏列表已按本地记录筛选，统计随 SQLite 数据变化，Flag/Unflag 真实持久化，旧库通过 `2026111801` 补齐 `flagged` 字段；远程提醒服务、自定义列表和自然语言日期解析未接入。

- `NX_NO_CLOUD=true pnpm nx run aiao-desktop-web:test --coverage.enabled=false src/app/apps/reminders/reminders-model.spec.ts src/app/data/schema-version.spec.ts --output-style=static`：34 条用例通过。
- `NX_NO_CLOUD=true pnpm nx run aiao-desktop-web:typecheck --output-style=static`、`NX_NO_CLOUD=true pnpm nx run aiao-desktop-web:lint --output-style=static` 与 `NX_NO_CLOUD=true pnpm nx run aiao-desktop-e2e:lint --output-style=static`：通过。
- `E2E_TRACE=1 NX_NO_CLOUD=true pnpm nx run aiao-desktop-e2e:e2e --group=reminder-filters --parallel=1 --report=/tmp/aiao-reminder-filters-green.json --output-style=static`：1 组全绿，Today/Scheduled/All/Flagged/Completed 统计与筛选、Flag/Unflag 均通过；归档报告见 [aiao-reminder-filters-green.json](evidence/2026-11-17/aiao-reminder-filters-green.json)。
- 既有 `reminder-drafts` 回归组重新通过，失败草稿、关闭等待、重试、完成状态和键盘持久化仍有证据；本轮未发布。

## 2026-11-18：备忘录置顶与取消置顶（ADESK-US-121）

ADESK-US-121 自动验收完成：Notes 工具栏、File 菜单和右键菜单可切换 Pin/Unpin，状态通过真实 SQLite 持久化，置顶优先排序和 US-116 的冲突保护继续生效；New Folder 已由 US-123 补齐。

- `NX_NO_CLOUD=true pnpm nx run aiao-desktop-web:test --coverage.enabled=false src/app/apps/notes/*.spec.ts --output-style=static`：23 条用例通过。
- `NX_NO_CLOUD=true pnpm nx run aiao-desktop-web:typecheck --output-style=static`：通过。
- `NX_NO_CLOUD=true pnpm nx run aiao-desktop-e2e:lint --output-style=static`：通过。
- `E2E_TRACE=1 NX_NO_CLOUD=true pnpm nx run aiao-desktop-e2e:e2e --group=notes-actions --parallel=1 --report=/tmp/aiao-notes-actions-green.json --output-style=static`：1 组全绿，`pinPersists = true`、`unpinPersists = true`，无页面错误；归档报告见 [aiao-notes-actions-green.json](evidence/2026-11-17/aiao-notes-actions-green.json)。

## 2026-11-18：Contacts 搜索与本地编辑流程（ADESK-US-120）

ADESK-US-120 自动验收完成：Contacts 搜索、非法草稿保留、真实 SQLite 创建/更新/删除和编辑冲突保护全部通过；远程联系人账号、电话、消息和邮件发送未接入。

- `NX_NO_CLOUD=true pnpm nx run aiao-desktop-web:test --coverage.enabled=false src/app/apps/contacts/contacts-model.spec.ts src/app/apps/contacts/contacts-data.spec.ts --output-style=static`：2 个文件、9 条用例通过。
- `NX_NO_CLOUD=true pnpm nx run aiao-desktop-web:typecheck --output-style=static`：通过。
- `NX_NO_CLOUD=true pnpm nx run aiao-desktop-web:lint --output-style=static`：通过。
- `NX_NO_CLOUD=true pnpm nx run aiao-desktop-web:build --configuration=production --output-style=static`：正式构建通过。
- `NX_NO_CLOUD=true pnpm nx run aiao-desktop-e2e:lint --output-style=static`：通过。
- `E2E_TRACE=1 NX_NO_CLOUD=true pnpm nx run aiao-desktop-e2e:e2e --group=contacts --report=/tmp/aiao-contacts-green.json --output-style=static`：5 项全绿、无页面错误；归档报告见 [aiao-contacts-green.json](evidence/2026-11-17/aiao-contacts-green.json)。

本地 Contacts 核心编辑范围已关闭；远程通讯录、头像上传、电话、消息、邮件和跨设备同步仍未接入。

## 2026-11-18：Calendar 事件草稿与失败保护（ADESK-US-119）

ADESK-US-119 自动验收完成：严格日期/时间输入、失败创建与更新、关闭等待、重试、并发冲突、Save a Copy、删除失败保护、键盘路径和刷新持久化全部通过；远程日历账号、邀请与同步未接入。

- `NX_NO_CLOUD=true pnpm nx run aiao-desktop-web:test --coverage.enabled=false src/app/apps/calendar/calendar-draft.spec.ts src/app/apps/calendar/calendar-input.spec.ts src/app/services/calendar-records.spec.ts src/app/services/calendar-store.spec.ts --output-style=static`：4 个文件、73 条用例通过，见 [单测日志](evidence/2026-11-17/calendar-unit-green.txt)。
- `E2E_TRACE=1 NX_NO_CLOUD=true pnpm nx run aiao-desktop-e2e:e2e --group=calendar-drafts --report=/tmp/aiao-calendar-drafts-green.json --output-style=static`：11 项全绿，无页面错误，`noViolations = []`；归档报告见 [aiao-calendar-drafts-green.json](evidence/2026-11-17/aiao-calendar-drafts-green.json)。
- `E2E_TRACE=1 NX_NO_CLOUD=true pnpm nx run aiao-desktop-e2e:e2e --group=calendar-drafts,persistence,apps,a11y,shell-interaction,document-workflow --report=/tmp/aiao-calendar-final.json --output-style=static`：6 组全绿，无页面错误；归档报告见 [aiao-calendar-final.json](evidence/2026-11-17/aiao-calendar-final.json)。
- 失败状态截图 [aiao-calendar-failure.png](evidence/2026-11-17/aiao-calendar-failure.png) 已目视检查；本轮未发布。

US-118 本地邮件草稿自动验收完成：真实 Drafts 保存、失败保留、跨页冲突与副本、搜索和分享内容，十五项正式构建检查及关联回归通过；真实邮件收发未接入。见[证据](evidence/2026-11-17/README.md#a06-本地邮件草稿us-118)。

US-117 本地会话草稿保护自动验收完成：逐会话输入、稳定 ID、真实写入失败和关闭等待，十四项浏览器检查与相关回归通过；真实通讯仍未接入。见[证据](evidence/2026-11-17/README.md#a06-本地会话草稿与范围us-117)。

US-116 备忘录编辑保护完成本地自动验收：单测、原覆盖率门槛、lint/typecheck，六组正式构建回归通过，含真实跨页冲突、SQLite 失败与保存副本。详见[原始证据](evidence/2026-11-17/README.md#a06-备忘录保存与编辑保护us-116)。

US-115 提醒事项草稿保护完成本地自动验收：1544 条单测与覆盖率门槛、lint/typecheck，五组正式构建回归通过。真实 INSERT/UPDATE 失败、写锁等待、重试及刷新重开均有[原始证据](evidence/2026-11-17/README.md#a06-提醒事项草稿保护us-115)。未发布，A06 其余应用继续。

## 2026-11-17：完整备份、恢复与中断保障

ADESK-US-111 自动验收完成，schema `2026111702`。备份、故障、旧库与旧构建升级共 58 项通过；相关文档、宿主、无障碍、多页和窗口回归通过，Finder 一次超时单独复验 15 项通过。web 1441 条与原覆盖率门槛、lint/typecheck/需求检查通过；公共 sqlite-wasm 的 1086 条在关闭浏览器文件并发后完整通过。范围、命令、失败和复验原始日志见[证据 A03](evidence/2026-11-17/README.md#a03-完整备份恢复与存储健康adesk-us-111)。本次未部署；下文早期范围限制保留为当时结论。

## 2026-11-17：Finder 文件管理与废纸篓恢复

ADESK-US-110 自动验收完成：15 项文件管理检查、对话框键盘与 axe、六组关联回归、真实旧构建升级，以及 1390 条单测和全部原覆盖率门槛通过。schema 从 `2026111301` 升到 `2026111701`，记录废纸篓原位置；导入每批上限 256 MiB。命令、源状态、真实产物和失败过程见[本轮证据](evidence/2026-11-17/README.md#a02-finder-文件管理adesk-us-110)。尚未发布，完整备份恢复继续按 A03 推进。

## 2026-11-17：文档保存与未保存内容保护

ADESK-US-109 自动验收完成：15 项文档浏览器检查、30 项跨页检查（五轮并发）、1375 条单测和覆盖率门槛、lint/typecheck 通过。新建保存、另存后刷新恢复、冲突保留草稿、整批关闭和重启取消均有证据；命令、提交基线、环境与原始结果见[本轮证据](evidence/2026-11-17/README.md)。尚未发布，自动完成计划的其他任务仍在继续。

## 2026-11-16：Bun 与 Python 终端交互补齐

修复 Python REPL 未恢复项目目录与 pip 包、`input()` 只读到首字符，以及 Bun `-e` 无法 `require()` 已安装依赖的问题。REPL 复用脚本会话并回写文件，Bun eval 从项目目录解析模块；worker 缓存参数更新到 4。

正式构建上 `terminal-runtimes`、`terminal-packages` 与 `disk-terminal` 三组共 58 项检查通过，无页面错误；运行时脚本 20 条测试与产品 / e2e 的 lint、脚本门禁通过。范围、修复前失败与最终报告见[本轮证据](evidence/2026-11-16/README.md)。本轮未发布线上。

## 2026-11-15：Python 与终端运行时补齐

已接入 Python 3.14 / pip、72 个固定 Python wheel、Ruff、TypeScript 7 和 SQLite 的同源资源。`terminal-runtimes` 在全新浏览器上下文、外网阻断的正式构建上通过全部 22 项：脚本与桌面文件、pip 安装与跨进程导入、科学计算与常用库、质量工具、退出码、顶层 await、TypeScript 编译、Bun 和两个 SQLite 模块。结果见[运行时报告](evidence/2026-11-15/terminal-runtimes.json)。

固定版本 SDK 补丁修复宿主资源路由、Ruff 模块导入、Pyodide 异步执行的 SystemExit 和 pip 的假成功；普通 VM 端口路由与 pip 失败路径有回归测试。资源脚本 16 条测试通过，行/函数覆盖率 100%、分支 96.39%；发布检查逐文件验证全部运行时资源。范围与边界见[终端资源说明](../scripts/vivari/README.md)，失败过程与最终门禁见[本轮证据](evidence/2026-11-15/README.md)。本轮没有发布线上。

完整产品 `verify` 退出码为 0，58 个任务成功（24 个本地缓存命中），总耗时 7 分 48 秒；完整 Chromium 冒烟 26 组全部通过（412.2 秒），另有 1 组夹具自检通过。前端 92 个测试文件、1,348 条用例、类型检查、lint、构建与密钥扫描全部通过。见[最终校验日志](evidence/2026-11-15/verify-runtimes-green.txt)。

## 2026-11-15：终端包管理器资源补齐

修复 Node 能启动、npm 因 `/vendor/npm-pack.bin` 漏部署而无法首次加载的问题。资源按 Vivari 1.3.0 上游固定版本与源包 SHA-512 生成，构建和开发共用前置任务；发布检查拒绝资源缺失、HTML、损坏包和错误版本。

`aiao-desktop:runtime-test:coverage` 通过，脚本行覆盖率 92.71%、分支 91.43%、函数 90%；`aiao-desktop:deploy-test` 通过。Chromium 全新上下文中，npm/npx、pnpm、Yarn、Corepack 的加载与版本查询、npm 安装固定 registry 依赖、Node 执行安装后模块均通过。Yarn 使用 `yarn versions --json`；`yarn --version` 的上游退出日志问题保留。测试 registry 由夹具拦截，不证明任意真实 registry 或第三方依赖都兼容。

前端单测 92 个文件、1,348 条用例与完整浏览器冒烟 25 组通过。首轮 `verify` 唯一失败是旧开发配置断言未包含新增的 vendor 前置任务；同步断言后单独复跑 `dev-test` 通过，未重复运行已通过的完整浏览器套件。

命令和正式构建浏览器报告见[本轮证据](evidence/2026-11-15/README.md)。本轮没有发布线上。

## 2026-11-15 当前结论

本轮只验收桌面Chrome（[D-19](decisions.md#d-19只验收桌面-chrome)）。当前21条Done、1条In Review；两项回溯基线例外已按[D-20](decisions.md#d-20接受两项回溯基线例外并批准本次正式发布)接受，正式发布及线上复验已完成，真实物理键盘已完成逐项记录，当前只剩 VoiceOver 一项 AC，用户于 2026-11-15 指示延期至后续验收，见[延期记录](evidence/2026-11-15/voiceover-deferral.json)。

本轮覆盖全部22个已立项故事，不包含尚未立项的后续方向。故事YAML是状态真相源：21条Done、1条In Review。实现、AC验收、依赖关闭和生产发布分别记录；不能把已有源码写成尚未实现，也不能因本地通过就声称已经发布。

每份证据保留实际执行时的SHA与工作区状态，后续源码变更及试验撤回也按对应报告追溯；环境为Apple M1 Max、Darwin 27.2.0 arm64、Node 26.12.0、pnpm 12.16.1。逐项检查、浏览器版本、产物摘要和命令见[证据索引](evidence/2026-11-14/README.md)。全部自动化完成后的最终汇总保留在同目录，不修改历史记录中的测量口径。

最终执行 `NX_NO_CLOUD=true pnpm nx run aiao-desktop:verify --skip-nx-cache --parallel=2 --output-style=static`，含根目标在内56个任务全部通过，退出码0，命令包装器实测347.906秒。web 92个测试文件/1348个用例与e2e脚本53个用例通过；默认Chromium 24组、479项检查全部通过，301.4秒。原始输出见[本轮聚合日志](evidence/2026-11-14/verify-browser-support-3.txt)和[元数据](evidence/2026-11-14/verify-browser-support-3-metadata.json)，[Chromium检查对象](evidence/2026-11-14/chromium-browser-support-verify.json)从该日志原样提取，不伪造日志未输出的逐组outcomes。首次聚合的懒加载夹具异常和修复见[完整记录](evidence/2026-11-14/browser-support.md)，失败日志保留。

[本轮覆盖率](evidence/2026-11-14/coverage-summary-browser-support.json)：语句98.61%、行99.31%、函数98.82%、分支95.35%，统计范围内逐文件行/语句均超过80%。本地验证不代替远端CI、历史流程评审、人工验收或本次正式发布。故事与剩余AC的机器视图见[收尾汇总](evidence/2026-11-14/closeout-summary.json)。

| 需求   | 已取得的证据                                                                                                                         | 剩余关闭条件                                      |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| US-006 | 逐文件行/语句80%门槛、正常覆盖率和负向失败；verify与CI test接线                                                                      | 本地聚合门禁已通过；未触发远端流水线或合并        |
| US-007 | 外网清单、说明页、Safari发送提示、源码主机扫描正反例；external-content正式构建检查                                                   | 无独立人工验收项                                  |
| US-008 | 检查组和夹具自检；原七组键集合对照；独占调度中位数0.77004倍；GPU三轮                                                                 | D-20已接受流程例外；首次拆分1.10543倍失败报告保留 |
| US-106 | 真实旧生产部署建库→同Origin切换当前产物，用户文件正文等数据完整；缺表、连续升级、中断、降级和旧页拒写                                | 依赖已关闭；B0之前旧部署不可作为新库的回滚目标    |
| US-205 | Applications、投影升级/下线、Finder与终端保护、Dock固定/运行态/排序/拖放及键盘等效操作                                               | 依赖已关闭，故事Done                              |
| US-206 | 运行时与种子懒加载、统一能力、生命周期、权限、文件面板及凭证版本检查；initial体积回溯对照通过                                        | D-20已接受流程例外，全部硬依赖已关闭              |
| US-104 | 布局、层叠、路径、最小化、按需内容、视口和多页隔离                                                                                   | 依赖已关闭，故事Done                              |
| US-105 | 并发写安全、三页收敛、文件/设置/备忘录、终端独立、目标消失后的失败                                                                   | 依赖已关闭，故事Done                              |
| US-107 | shell-interaction、正式构建检查及[九组真实键盘与界面入口人工记录](evidence/2026-11-14/manual-chrome-acceptance.md)；原始事件单独保留 | 已关闭；目标组合未送达的边界已同步能力矩阵        |
| US-108 | ARIA 树、纯键盘流程、焦点交接；动画中还原的确定性红绿回归                                                                            | VoiceOver V01～V14 按用户要求延期，AC#6 未验收    |
| US-005 | Chrome/Chromium两轮24组、479项全过，窄屏与触屏仿真通过；浏览器范围按D-19收敛                                                         | AC与全部硬依赖已关闭，故事Done                    |
| US-004 | 域名绑定及两入口只读核对；实际Chrome中同站项目与已有GitHub登录对照；真实Aiao Code两种组合验收                                        | 本次上传、两个入口及后续95文件复验完成，故事Done  |

### 本轮发现并修复的回归

关闭和最小化开始时立即交接焦点，动画收尾不抢走后来打开的窗口焦点；已保留窗口管理单测红绿记录。随后固定最小化动画在中途，证明Dock还原请求被busy吞掉，再允许还原中断最小化并清理旧onfinish。`a11y`、`window-layout`、`host-filesystem`三组并发的[绿报告](evidence/2026-11-14/animation-restore-green.json)全部通过。

文件面板在输入前等待可见及初始焦点，覆盖确认退出后等待保存输入框重新取得焦点。完整运行曾把目录列表活查询滞后时的安全拒写误当成Esc失败；[确定性红报告](evidence/2026-11-14/file-panel-list-red.json)显示存储层正确返回FILE_CHANGED且磁盘保留原文。现单独检查滞后列表绝不覆盖，再等文件行可见后验证覆盖确认；[三组并发绿报告](evidence/2026-11-14/file-panel-list-green.json)与两个非默认引擎的定向复验通过，原有键盘断言未放宽。

启动台Enter误用尚未刷新的旧网格，已用当前筛选数据修复；FaceTime的[确定性红](evidence/2026-11-14/app-search-enter-red.json)与[三组并发绿](evidence/2026-11-14/app-search-enter-green.json)保留。随后补齐Dock点击Maps后的开窗前置条件、Spotlight读取AX树前的结果与选中状态等待；[定向报告](evidence/2026-11-14/dock-a11y-state-green.json)全部通过。完整运行中的失败报告在证据索引独立保留。

冒烟与线上Aiao Code报告曾从e2e子目录用相对路径采集git status，导致changes为空；本轮修为仓库顶层路径。早期报告的空changes字段不证明工作区干净，其SHA、实际产物摘要和本台账的workspace标记一起使用，不回写伪造历史字段。

### 真实线上边界

发布前的真实旧生产部署为 `d650c06f-2ad5-4c8c-9345-a5b8a30be1e9`，Cloudflare记录Source `bcfaa45`不保证当时无工作区修改。升级验收只在独立浏览器上下文里用网络加载旧部署，再在同一HTTPS Origin路由到当前本地产物；该历史升级测量没有发布或修改线上资源。

同站项目与已有登录已在用户实际Chrome配置中核对，使用唯一验收项目并恢复原项目；记录已脱敏，未执行登录/OAuth。该结论不表示两个桌面Origin的数据共享。

双域名隔离验收通过真实终端复制创建用户文件并读回正文：新Origin没有旧Origin的用户文件、文件夹或备忘录；返回旧Origin后用户文件正文、文件夹、备忘录与设置完整。抽取共享文件操作后再次执行，9项全部通过，见[最终双域名报告](evidence/2026-11-14/domain-storage-final.json)。此前旧部署覆盖种子文件及终端写入产生的 `Storage file meta not found` 两份失败报告保留；复制路径通过不表示旧部署缺陷已修，该历史报告不作为本次发布证据；本次发布后的新结果见下方。

### 本次正式发布与线上复验

[D-20](decisions.md#d-20接受两项回溯基线例外并批准本次正式发布)授权后，已上传生产部署 `b093f8b2-9bc7-492c-9a8b-1928f8397ada`，源提交 `b6827b105`，产品源码未在本轮改变。入口SHA256为 `2f142ced7f1617a3463d1c008c5e0f8b5836934b8d4bf16b5df2248fa6ec873c`。

[原始发布日志](evidence/2026-11-14/release-production.txt)与[元数据](evidence/2026-11-14/release-production-metadata.json)保留退出码1：上传成功，两个生产入口核对通过，独有部署地址的5个文件下载超时。随后对同一部署进行[只读逐文件复验](evidence/2026-11-14/release-curl-reconciliation.json)，95个公开文件的长度、SHA256与跨源隔离响应头全部通过，没有重复上传；97个产物中的`_headers`和`_redirects`由托管消费，不作为公开文件下载。原失败没有改写成命令通过。

[两个生产入口](evidence/2026-11-14/release-entrypoints.json)均为200、无重定向、入口字节与候选产物一致。[双域名存储隔离](evidence/2026-11-14/release-domain-storage.json)9项及[真实线上Aiao Code](evidence/2026-11-14/release-aiao-code.json)9项通过，页面错误集合为空。

[本机Google Chrome入口核对](evidence/2026-11-14/release-chrome-entry-provenance.json)使用Chrome 157.0.8103.52、全新临时配置，确认Finder可见与跨源隔离成立。自定义域名对浏览器响应额外插入367字符、指向`static.cloudflareinsights.com`的模块脚本，原构建字符未删除、主模块未变；因此浏览器入口摘要为`a23d249747af4e6cfc0cdb8604d570324c1f27dbeaca8134bf34bfd029fc85fc`。该差异有原始响应的前后公共片段长度、额外脚本地址与摘要，不凭“运行正常”推断二者逐字节相同。本次产物、部署与剩余人工项见[发布收尾记录](evidence/2026-11-14/release-closeout.json)。

### 尚未证明

- US-008 #10与US-206 #7的实现前流程缺失已按[D-20](decisions.md#d-20接受两项回溯基线例外并批准本次正式发布)接受一次例外；回溯测量仍只描述实际2026-11-14的测量，不改写历史。
- US-107 #8 已由用户物理按键并逐项记录完成，未收到目标组合的情况与人工确认的替代入口分别保留；US-108 #6 仍需 VoiceOver V01～V14 的真实逐步播报。先前检查时 VoiceOver 未运行，启动超时没有产生验收结果，当前开启状态仍待用户确认；操作清单不是实测记录。
- 用户明确要求“只验收 chrome 就够了”，已在[D-19](decisions.md#d-19只验收桌面-chrome)记录并同步US-005、能力矩阵与README。Chrome/Chromium两轮完整报告各479项通过；Safari、Firefox、WebKit的[历史复验](evidence/2026-11-14/browser-support.md)与未完成观察保留，不再构成本轮必验阻塞。US-005的AC与全部硬依赖已关闭。
- 本次生产部署已上传并完成后续线上复验。当前版本写入schema 2026111301；B0之前旧部署不具备降级保护，升级后不能回滚到它。原命令打印的旧部署回滚提示不能据此当作可用的数据回滚点。
- 配额耗尽、OPFS完全不可用、抹掉中断、数据导出导入、完整离线、真实移动端仍不在本轮已立项交付的证明范围。已验收的目标删除/改名/抹掉后保存失败，不代表这些其他失败路径也已验证。

[Safari 再次游戏检查](evidence/2026-11-14/safari-game-probe.json)是范围收敛前的历史观察：未确认的输入、锁定、错误集合或根因没有改写为通过。浏览器范围以[范围调整记录](evidence/2026-11-14/chrome-only-scope.json)为准；D-20之后的当前待关闭AC以[需求汇总](evidence/2026-11-14/closeout-summary.json)为准。

## 2026-11-12～13 历史证据

以下记录保留原始日期、命令与数字，用于追溯既有Done故事；当前实现与验收以2026-11-14记录为准。早期行没有完整提交信息的，不追补假定SHA。

## 结构门禁与构建

| 故事与 AC       | 验证层级    | 入口                                                                                                                                       | 当前结论                                                                                                                            |
| --------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| ADESK-US-001 #1 | 文档 / 夹具 | `aiao-desktop:requirements-test`、`aiao-desktop:requirements-check`；[check-requirements.spec.mjs](../scripts/check-requirements.spec.mjs) | 通过：当前目录通过门禁；夹具覆盖 ADESK 前缀、仓库根的平台引用、拒绝 `DESKTOP` 与其他产品前缀、Done 故事的 AC、失效链接              |
| ADESK-US-001 #2 | Nx 项目发现 | `pnpm nx show project aiao-desktop`、`aiao-desktop-web`、`aiao-desktop-e2e`                                                                | 通过：root 分别为 `aiao-desktop`、`aiao-desktop/apps/web`、`aiao-desktop/apps/e2e`，tags 与 targets 可读                            |
| ADESK-US-001 #3 | 检索 / 构建 | `git grep` 旧目录与旧项目名；`aiao-desktop-web:build`                                                                                      | 通过：无残留引用；产物在 `dist/aiao-desktop/apps/web`，初始包 1.09 MB（传输约 256 kB）                                              |
| ADESK-US-001 #4 | 依赖图      | `pnpm nx graph --file=<json>`；检索 e2e 源码的导入                                                                                         | 通过：产品内只有产品根 → web、产品根 → e2e、e2e → web 三条隐式依赖；web 没有产品内依赖；e2e 只导入 Node 内置模块与 `playwright`     |
| ADESK-US-001 #5 | affected    | `pnpm nx show projects --affected --files=<file>`                                                                                          | 通过：改 `aiao-desktop/apps/web/src/main.ts` 列出 web、e2e 与产品根；改 `aiao-desktop/requirements/roadmap.md` 只列产品根           |
| ADESK-US-001 #6 | 安全门禁    | [check-web-secrets.spec.mjs](../scripts/check-web-secrets.spec.mjs)；`aiao-desktop:audit-secrets`                                          | 通过：夹具覆盖五类密钥形状、不回显取值、跳过二进制文件、产物目录缺失时失败；真实产物 10 个文本文件无命中                            |
| ADESK-US-001 #7 | 聚合门禁    | `pnpm nx run aiao-desktop:verify --skip-nx-cache`                                                                                          | 通过：2026-11-13 连同依赖共 51 个任务（web 引入平台包后多了上游的类型检查与构建），约 74 s                                          |
| ADESK-US-001 #8 | CI 接入     | `pnpm nx show projects --withTarget=e2e`（以及 `test`、`audit-secrets`、`lint`、`typecheck`、`build`）；按 CI 测试 lane 的步骤本地复跑     | 通过：e2e 在 `e2e`；产品根在 `test` 与 `audit-secrets`；web 在 `lint`、`typecheck`、`build`；带覆盖率参数跑产品根的 `test` 照常通过 |

## 本地开发入口

| 故事与 AC               | 验证层级                            | 入口                                                                                                                 | 当前结论                                                                                                                                                              |
| ----------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ADESK-US-002 #1、#2、#9 | 本机实跑                            | `AIAO_DEV_OPEN=false pnpm nx dev aiao-desktop --output-style=stream`；运行中再跑 `dev-ports`；停止后用 `lsof` 查端口 | 通过：四个任务按序就绪，4410 返回 200，导航页可用；端口检查报出 Web 开发服务器与开发导航两处占用后失败；停止后三个端口全部释放                                        |
| ADESK-US-002 #3～#8     | 浏览器（Chromium 驱动导航页）/ HTTP | 导航页、`/status.json` 与 `serve-static`                                                                             | 通过：两种状态（预览未启动 / 已启动）的徽标正确；复制按钮写入剪贴板；开发服务器上 `crossOriginIsolated` 为 true；403 / 405 / 404 与响应头符合预期；390 宽没有横向滚动 |
| ADESK-US-002 #10        | Node 测试                           | `aiao-desktop:dev-test`（[services.spec.mjs](../scripts/dev/services.spec.mjs) 等 4 个文件）                         | 通过                                                                                                                                                                  |

## 单元测试

| 故事与 AC    | 验证层级  | 入口                                                                                              | 当前结论                                                                                                                                                                                                                                                                            |
| ------------ | --------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ADESK-US-102 | Node 单测 | `aiao-desktop-web:test`（`vitest.config.mts`，Node 环境）                                         | 通过：覆盖路径与种类、目录树组装、内置磁盘与文件格式（PDF 读回、WAV、占位文件头、Info.plist）、卷的首次复制 / 保留 / 抹掉、终端同步的差异与双向同步（内存磁盘加假虚拟机）、对已安装 `@vivari/core` 的 sh 打补丁后在宿主 Node 上实跑、补充命令在临时目录里实跑，以及各应用的数据转换 |
| ADESK-US-103 | Node 单测 | [saltline.spec.ts](../apps/web/src/app/apps/saltline/saltline.spec.ts)（`aiao-desktop-web:test`） | 通过（2026-11-13）：登记为单窗口内置应用且在启动台里；入口是相对地址，与桌面同源；入口文件随构建发布，`<title>` 就是登记名；游戏不引用外部脚本、样式与媒体。登记表的内置应用数由 `desktop-apps.spec.ts` 断言                                                                        |

## 浏览器冒烟

| 故事与 AC           | 验证层级                                                                                          | 入口                                                             | 当前结论                                                                                                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ADESK-US-101 #1～11 | 浏览器：Chromium 无头、正式构建、视口 1440×900、外网请求全部拦截                                  | `aiao-desktop-e2e:e2e`（[smoke.mjs](../apps/e2e/src/smoke.mjs)） | 通过：输出 JSON 的全部检查项为 true，`unopened` 为空，没有页面错误；冒烟约 26 s                                                                                                            |
| ADESK-US-102 #1～14 | 浏览器：同上，全新浏览器配置（OPFS 为空，首次打开写入内置内容），中途刷新一次                     | `aiao-desktop-e2e:e2e`（同一个脚本，接在 US-101 的检查之后）     | 通过（2026-11-13）：`diskState` 13 项与 `persistence` 6 项全部为 true，没有页面错误；整份冒烟约 43 s                                                                                       |
| ADESK-US-103 #1～#8 | 浏览器：同上；#1～#7 用替身页顶替 `/saltline.html`，#8 换回真游戏（无头 Chromium 只有软件 WebGL） | `aiao-desktop-e2e:e2e` 的 `game` 检查组                          | 通过（2026-11-13）：`game` 13 项全部为 true，`unopened` 为空，没有页面错误；真游戏约 40 s 启动到标题画面，整份冒烟约 115 s。首轮暴露启动台的延时聚焦会抢走新窗口的焦点，修复后连跑两轮通过 |
| ADESK-US-103 #9     | 浏览器：本机 Chrome 157（Apple M1 Max，ANGLE Metal）、正式构建，脚本驱动                          | 从启动台打开游戏 → 开始行动 → 点击画面 → Esc → 最小化            | 通过（2026-11-13）：15.7 s 到标题画面（画质 high）；指针锁定生效、约 60 帧每秒，Esc 后暂停；游戏开着时从 Dock 打开计算器 65 ms；最小化后游戏循环仍每秒 60 帧（已知限制，见 D-15）          |

## 应用体系与集成应用

| 故事与 AC                                 | 验证层级                                                                                  | 入口                                                                                                                                                                     | 当前结论                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ADESK-US-201 #1～#3                       | Node 单测                                                                                 | `aiao-desktop-web:test`（[desktop-apps.spec.ts](../apps/web/src/app/services/desktop-apps.spec.ts)）                                                                     | 通过：真实登记表合规（系统入口、内置应用与集成应用各就各位，数量由单测断言）；14 种不合规登记逐项报出应用与字段；允许来源只有 `https://vscode.aiao.io`                                                                                                                                                                                                                                                                                                                                                                   |
| ADESK-US-202 #9（其余失败原因）           | Node 单测                                                                                 | [web-app-failure.spec.ts](../apps/web/src/app/apps/web-app/web-app-failure.spec.ts)                                                                                      | 通过：加载失败、超时、应用自报、整页导航与其他错误的文案；只有运行中的失败交给窗口显示                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Orbit 的 `focus()` 与加载后未握手即失败   | 浏览器单测（Chromium）                                                                    | `orbit:test`（[runtime.browser.spec.ts](../../packages/orbit/src/__tests__/runtime.browser.spec.ts)）                                                                    | 通过：5 个文件、46 个用例；入口 404 时 3 秒宽限后以 `LOAD_ERROR` 失败，不等 60 秒就绪时限                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ADESK-US-201 #4～#7、ADESK-US-202 #1～#10 | 浏览器冒烟：Chromium 无头、正式构建、外网全部拦截，替身应用顶替 `https://vscode.aiao.io/` | `aiao-desktop-e2e:e2e`（[smoke.mjs](../apps/e2e/src/smoke.mjs) 的 `integratedApp` 检查组）                                                                               | 通过：`integratedApp` 25 项全部为 true，`everyAppOpens` 的 `unopened` 为空，没有页面错误；整份冒烟约 60 s。缩放检查做过反证：不给 iframe 设 `pointer-events: none`，指针一进 iframe 就丢了跟踪                                                                                                                                                                                                                                                                                                                           |
| ADESK-US-203 #1～#6                       | 浏览器（Chromium 无头）、桌面正式构建、真实网络                                           | `aiao-desktop-e2e:verify-aiao-code`（[verify-aiao-code.mjs](../apps/e2e/src/verify-aiao-code.mjs)）                                                                      | 通过：发布前用 `--vscode-dist` 指向带握手与 CORP 的本地产物，6 项全过；当时的线上版本缺 CORP，窗口按预期显示「vscode.aiao.io didn’t connect」。Aiao Code 发布（Pages 部署 `408194ed`，源 `4e9de996`）后对线上重跑，6 项全过：就绪 3.3 s，WebContainer 终端 5.4 s 运行，重开 1.4 s，桌面与应用都没有错误。线上入口带恰好一个 `Cross-Origin-Resource-Policy: cross-origin`，`/ngsw.json` 与本地产物逐项一致；发布前访问过的浏览器目录里旧 Service Worker 先降级放行到网络（页面已跑新版），约 40 s 后装好新版本恢复 NORMAL |
| ADESK-US-203 Dock 图标 | 2026-11-20，基于 `a458373de` 的工作区，macOS 15.7.9，Chromium 158.0.8127.18 无头 | `pnpm nx run aiao-desktop-e2e:e2e --args='--group=shell --group=applications'` | `shell.fileBackedIcons` 通过。正式产物 `dist/aiao-desktop/apps/web/browser` 的 Dock 从独立 PNG 加载并解码出 256 × 256 的 Aiao Code 图标。 |
| ADESK-US-204 #1～#6                       | 浏览器冒烟：同上，替身分标准与透明两种                                                    | `aiao-desktop-e2e:e2e` 的 `transparentWindow` 检查组与 `integratedApp.standardKeepsChrome`                                                                               | 通过：`transparentWindow` 10 项全部为 true；拖动层盖住替身标题栏空白、挖掉按钮；双击与绿色按钮切换缩放；前台状态推到应用                                                                                                                                                                                                                                                                                                                                                                                                 |
| ADESK-US-204 #7、#8                       | Node 单测与浏览器单测（Chromium）                                                         | `orbit:test`（[window.spec.ts](../../packages/orbit/src/__tests__/window.spec.ts)、[window.browser.spec.ts](../../packages/orbit/src/__tests__/window.browser.spec.ts)） | 通过：7 个文件、57 个用例；标准窗口隐藏装饰被拒、参数校验；真实 iframe 里拖动区挖掉按钮，布局变化重报，停止时清空                                                                                                                                                                                                                                                                                                                                                                                                        |
| ADESK-US-204 #9、#10                      | 浏览器（Chromium 无头）、桌面正式构建、本地产物与线上 vscode.aiao.io                      | `aiao-desktop-e2e:verify-aiao-code --vscode-dist=…`                                                                                                                      | 通过：发布前对本地产物 9 项全过（就绪 0.5 s、终端 3.6 s、重开 1.1 s）；Aiao Code 发布（Pages 部署 `22477575`）后对线上 9 项全过（就绪 2.9 s、终端 4.5 s、重开 1.9 s），桌面标题栏收起，Aiao Code 自绘红黄绿                                                                                                                                                                                                                                                                                                              |

## 发布

| 故事与 AC               | 验证层级                                                     | 入口                                                                                                                                                                                                            | 当前结论                                                                                                                                                                                                                                                                                                                                                |
| ----------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ADESK-US-003 #1         | Node 单测 + 本地 Pages 模拟                                  | `aiao-desktop:deploy-test`（[config.spec.mjs](../scripts/deploy/config.spec.mjs)、[dist-check.spec.mjs](../scripts/deploy/dist-check.spec.mjs)）；`wrangler pages dev` 托管正式构建（与线上同一份资源服务代码） | 通过：随构建发布的 `_headers` 与发布配置一致；模拟下 `/` 与 `.wasm` 带 COOP / COEP，`.wasm` 是 `application/wasm`；`/saltline.html` 加 `_redirects` 后直接 200（不加是 308 到 `/saltline`）；不存在的路径回 `index.html` 且 200，所以线上对账比字节                                                                                                     |
| ADESK-US-003 #2、#3、#9 | Node 单测 + 本机实跑                                         | `aiao-desktop:deploy-test`（[dist-check.spec.mjs](../scripts/deploy/dist-check.spec.mjs)、[deploy.spec.mjs](../scripts/deploy/deploy.spec.mjs)）；`pnpm nx run aiao-desktop:deploy --dry-run`                   | 通过：deploy-test 41 个用例，随产品根的 `test` 与 `verify` 运行；dry-run 经 Nx 转发参数，20 个文件 13.0 MB，只打印将执行的命令                                                                                                                                                                                                                          |
| ADESK-US-003 #4、#6、#7 | 真实 Cloudflare 账号：本机 wrangler OAuth 登录（账号 Jimmy） | `pnpm nx run aiao-desktop:deploy`（2026-11-13 首次）                                                                                                                                                            | 通过：新建项目 `aiao-desktop`（先用一次性的 scratch 项目实测 `--force` 与结构化输出，用完删除），上传 18 个文件，部署 `b79247e9`；生产地址入口页一致，但部署地址当时 TLS 握手失败（子域名证书未签发，用 curl 对照老项目的同类地址确认不是本机网络问题），由此加了「先等地址连得上」；之后重跑，部署 `467bbfe5` 的 18 个文件逐字节一致且均带 COOP / COEP |
| ADESK-US-003 #5         | 同上                                                         | 第二次 `deploy`                                                                                                                                                                                                 | 通过：识别出已存在的项目，打印上一版生产部署 `b79247e9`（源 `bcfaa45`）；没有文件重新上传（18 个已存在）；整条命令约 25 s（构建与密钥扫描命中缓存）                                                                                                                                                                                                     |
| ADESK-US-003 #8         | 同上                                                         | `deploy --preview`                                                                                                                                                                                              | 通过：Preview 部署 `18c9bffa`，别名 `preview.aiao-desktop.pages.dev` 入口页一致；生产部署列表的最新一条仍是 `467bbfe5`                                                                                                                                                                                                                                  |
| ADESK-US-003 #10        | 浏览器（Chromium 无头）、线上桌面加线上 vscode.aiao.io       | `aiao-desktop-e2e:verify-aiao-code --desktop-url=https://aiao-desktop.pages.dev`                                                                                                                                | 通过：9 项全过，就绪 1.9 s、终端 2.9 s、关闭后重开 1.3 s，桌面与应用都没有错误                                                                                                                                                                                                                                                                          |

## 2026-11-16：PWA 增量验收

| 日期 / 源码                                     | 环境                                                                             | 命令与证据                                                                                                                                        | 结论                                                                                                                                                                                                                        |
| ----------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-16；`1111da18b6` 加本次未提交工作区改动 | Apple M1 Max / darwin 27.2.0 arm64 / Node v26.12.0 / 无头 Chromium 158.0.8127.18 | `aiao-desktop-e2e:e2e --group=pwa,terminal-runtimes`；[报告](evidence/2026-11-16/pwa-terminal.json)、[命令与复跑记录](evidence/2026-11-16/pwa.md) | PWA 14 项、终端 30 项全部通过，页面错误为空。正式构建、类型、lint、1,353 个 web 单测与覆盖率门槛通过。首次 verify 的终端启动超时经隔离复跑和联跑通过；路线图漏记已补齐并复验需求门禁。首次 verify 退出码 1 的原始记录保留。 |

本轮只交付 US-009 的本地代码与自动验收；没有生产发布、原生安装对话框或物理键盘实测。现有线上发布结果与 US-108 的 VoiceOver 保留不变。

2026-11-17 A04 增量：[US-207](stories/application/ADESK-US-207-approved-app-catalog.md) 已完成。批准目录与版本管理 15 项生命周期检查、9 组关联回归、1481 条单测、原覆盖率门槛和 lint/typecheck/需求检查通过，见[当日证据](evidence/2026-11-17/README.md#a04-批准应用目录与版本管理adesk-us-207)。正式目录为空，实际发布版本由运营提供；schema 已升至 2026111703，本次未发布。
