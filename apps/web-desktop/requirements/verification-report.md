# Web Desktop 分层验收台账

已实现第一轮 Orbit 运行基础、仓内消费迁移及桌面主体。42 条故事均为 In Progress（0 Backlog、0 Done）。256 条 AC 尚未完成完整产品验收；以下分别登记代码测试证据与产品验收缺口。故事 YAML 与 AC 表为唯一状态来源。

## 验证层级

| 层级               | 可证明内容                                               | 不能替代的证据                                | 当前产品结果                                     |
| ------------------ | -------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------ |
| 文档结构           | 编号、YAML、AC 连续性、引用、依赖、派生视图和格式一致    | 任意运行行为                                  | 见本轮文档核验                                   |
| 单元与集成         | 生命周期、资源加载、身份、服务授权、数据事务及错误分支   | 真实浏览器、实机或最终部署                    | 运行基础、服务授权、原子事务和迁移已有自动化证据 |
| 浏览器端到端       | 双模式窗口操作、三框架组合、文件工作、离线、升级与恢复   | 真实 Safari、宿主快捷键、屏幕阅读器及正式部署 | 33 条 Chromium 桌面旅程通过；其他组合待验收      |
| 真实环境与正式产物 | macOS / Windows 实机、Safari、读屏、最终部署、下载与性能 | 其他环境未经验证的组合                        | 未执行                                           |

每条 AC 在实现时登记故事 ID、AC 号、测试符号或操作脚本、提交和构建版本、真实宿主与浏览器版本、结果和产物位置。只有同层级证据完整时才可标 ✅，缺口用 ⬜ 或 ⚠️ 表达。

## 2026-11-07 Orbit 运行基础证据

本轮使用工作区代码在 macOS 上执行 Nx 检查，Node 26.13.0；真实浏览器测试使用 Playwright Chromium。源码位置为 [`packages/orbit`](../../../packages/orbit/README.md)，设计取舍与固定上游来源见 [UPSTREAM.md](../../../packages/orbit/UPSTREAM.md)。以下记录不将运行基础自动等同于完整桌面产品验收。

| 检查                          | 结果                                                                                                                                   | 可复验入口                                                                                                                                                                                              |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 核心及协议构建 / 类型 / lint  | 两个项目六项任务通过；核心公共 API 文档检查通过                                                                                        | `pnpm nx run-many -t build,typecheck,lint -p orbit,orbit-protocol --parallel=1`                                                                                                                         |
| 核心单元及 Chromium 集成      | 5 个文件、44 条测试通过；其中浏览器 16 条，含三框架真实渲染与生命周期                                                                  | `pnpm nx test orbit --coverage`；[测试源码](../../../packages/orbit/src/__tests__/runtime.browser.spec.ts)、[三框架源码](../../../packages/orbit/src/__tests__/frameworks.browser.spec.ts)              |
| 全源码覆盖率                  | statements 97.19%、branches 95.37%、functions 97.50%、lines 98.57%，四项均超过核心 90% 门槛                                            | `coverage/packages/orbit/coverage-summary.json`，纳入全部 `src/**/*.ts` 实现文件                                                                                                                        |
| 文档站主题 / 路由 / 样式协议  | 4 个文件、91 条测试通过                                                                                                                | `pnpm nx test orbit-protocol`；[协议测试](../../../modules/orbit/src/__tests__/host-route.spec.ts)                                                                                                      |
| 既有消费方 lint / 类型 / 测试 | website、三框架演示、benchmarks 五个项目全部通过；Angular 514、React 374、Vue 308、benchmarks 131、website 43 条测试                   | `pnpm nx run-many -t lint,typecheck,test -p website,dev-rxdb-angular,dev-rxdb-react,dev-rxdb-vue,benchmarks --excludeTaskDependencies --parallel=1`；复用已构建依赖，website 接线断言修正后单独复跑通过 |
| 生产构建                      | 三框架演示及 benchmarks 四个项目均通过                                                                                                 | `pnpm nx run-many -t build -p dev-rxdb-angular,dev-rxdb-react,dev-rxdb-vue,benchmarks --excludeTaskDependencies --parallel=1`                                                                           |
| 真实生产应用冒烟              | 使用实际构建产物经 Orbit 装载，三端初始主题、主题下发 / 回请、双向路由、销毁及独立打开通过；benchmarks 验证就绪、主题和销毁 / 独立打开 | 本机临时 Playwright 脚本 `/tmp/orbit-consumers-smoke.mjs`，经 `pnpm nx exec --projects=@aiao/source --excludeTaskDependencies -- node /tmp/orbit-consumers-smoke.mjs` 执行；不代替正式桌面端到端门禁    |

Chromium 场景包括：双实例 DOM / JS / 事件独立、精确来源准入与拒绝伪造握手、相对资源与动态导入、显式 ready、属性和定向事件、双向请求与取消、启动中关闭、超时重试、隐藏恢复，以及 30 轮创建销毁。三框架宿主入口共用 `OrbitBinding`，React 覆盖 StrictMode；三个实际框架子应用渲染完成后才 ready。

30 轮检查证明实例登记与 iframe DOM 回收，不是堆快照或相对上游的性能对比。同源原生存储不按实例自动隔离；隐藏不等于挂起；服务授权、离线版本固定、桌面外壳和真实 Safari / Windows / 读屏仍需后续证据。完整文档导航按失败处理，SPA history / hash 导航保留。

## 首版必验收环境

| 宿主         | 浏览器             | 交互模式       | 必须覆盖                                             |
| ------------ | ------------------ | -------------- | ---------------------------------------------------- |
| 真实 macOS   | Chrome、Edge       | macOS、Windows | 主旅程、输入法、快捷键边界、全屏、剪贴板、下载、离线 |
| 真实 macOS   | Safari             | macOS、Windows | 同上，并实际验证 iframe/Shadow DOM、资源加载与恢复   |
| 真实 Windows | Chrome、Edge       | macOS、Windows | 主旅程、输入法、快捷键边界、全屏、剪贴板、下载、离线 |
| 真实 macOS   | Safari + VoiceOver | 两种模式       | 主要任务的名称、角色、状态、焦点、模态与异步提示     |
| 真实 Windows | Edge + NVDA        | 两种模式       | 同上                                                 |

实施验收时固定当前稳定浏览器版本及操作系统版本；不是持续承诺任何未来版本都已通过。Playwright 的 Chromium/WebKit 覆盖浏览器测试证据，真实 Safari、VoiceOver/NVDA、系统截获键及本机下载结果要另存实机记录。Firefox、手机和旧版 IE 没有当前支持承诺。

## 性能测量口径

以下预算是需求目标，尚无实测结果。标准样例为可控的独立文本应用：完整资源不超过 300 KiB（传输压缩后），文档为 100 KiB UTF-8 文本，不发额外业务请求。正式构建、不启用开发工具扩展；保留原始采样记录。

- 基准设备：macOS 与 Windows 各至少一台 4 核、8 GiB 内存设备，桌面视口 1440×900，100% 缩放，记录 CPU 型号、系统、浏览器、构建版本与电源状态。
- 冷启动：清空资源缓存并确保桌面数据集可初始化；网络限制为下行 20 Mbps、往返延迟 100 ms。自浏览器开始导航至桌面可响应键盘和启动入口，采样 30 次，p95 不超过 3 秒。
- 应用热打开：资源已完整缓存，无既有运行实例；自用户启动到标准应用报告就绪且可编辑，30 次采样，p95 不超过 1 秒。应用升级准备与数据迁移不混入热打开样本。
- 交互响应：10 个标准应用各运行 2 个独立实例，共 20 个实例及 20 个窗口。采集至少 100 次移动、缩放、切换动作，操作到可见反馈 p95 不超过 100 毫秒。标准应用以不同 appId 登记且执行相同资源与任务，不把空窗口当运行应用。
- 资源回收：执行 30 轮创建、隐藏、恢复与销毁；已登记实例、订阅、观察器和动态节点回到初始计数。堆快照需检查已销毁实例引用链，不能仅用一次总内存读数声称无泄漏。

## 必验收组合

| 组合                                         | 需要捕获的错误                           |
| -------------------------------------------- | ---------------------------------------- |
| 两种模式切换 + 脏文档 + 最小化/贴靠 + 模态框 | 重载丢内容、边界丢失、焦点逃逸、重复实例 |
| 三框架 × 同应用双实例 × 路由/弹层/中文输入   | 样式污染、事件串发、路由覆盖、输入丢失   |
| 安装/更新 × 离线中断 × 新增权限 × 旧版本存活 | 半安装、混版本、静默权限扩展、无法回退   |
| 关闭/退出/卸载 × 保存失败/取消/无响应        | 未保存内容丢失、部分退出、幽灵实例       |
| 文件导入/备份恢复 × 额度不足/损坏/同名       | 半写入、静默覆盖、遗漏文件字节           |
| 两标签页同时启动/接管/旧页恢复               | 双写、失效拥有者继续写入或发通知         |
| 原文档站 + 三框架演示                        | 主题、路由、样式及独立运行回归           |

## 本轮文档核验

本轮结构核验通过 `web-desktop:requirements-check` Nx 目标复验；其结果只证明需求文档一致，不将产品 AC 标绿。

| 检查           | 结果                                                                                      | 复验口径                                                                                                                    |
| -------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 故事和 AC      | 42 条故事、8 个 Epic、256 条连续数字 AC；0 Backlog、42 In Progress，AC 全部未完成产品验收 | 解析 stories 下 YAML 与数字 AC 行，校验唯一 ID、必填字段、文件名和日期                                                      |
| 依赖与范围     | 硬依赖均存在、无环、无里程碑倒挂；平台能力引用存在                                        | 读取 dependsOn 和 capabilities，遍历依赖图并对照平台故事                                                                    |
| 派生视图与规格 | 状态总览、Epic、路线图、能力矩阵中的故事齐全，24 条 FR 有承接故事                         | 对照故事 ID、文件链接、里程碑与汇总数量                                                                                     |
| 本地链接       | 本产品文档的本地目标及使用到的标题锚点有效                                                | 逐条解析相对链接并检查文件及标题                                                                                            |
| 平台需求门禁   | 通过；平台故事数量保持 129                                                                | `pnpm nx exec --projects=@aiao/source --excludeTaskDependencies -- node scripts/audit/requirements-consistency.mjs --check` |
| 格式与空白     | Nx 格式检查和 Git 空白检查通过                                                            | 将本轮修改文件逐行输入 `pnpm nx format:check --stdin`；`git diff --check`                                                   |

平台门禁保留一条原有非阻塞提示：根研究文档 [board-v2-github-projects-style.md](../../../requirements/domain-research/board-v2-github-projects-style.md) 的两个带日期标题。该文档不在本轮修改范围，不影响本产品故事统计。

## 桌面实施检查点（2026-11-07）

桌面源码位于 `apps/web-desktop/src`，运行方式见 [应用说明](../README.md)，[逐 AC 登记](acceptance-evidence.md) 覆盖全部 256 条标准。当前不把自动化片段当作实机验收，也不据此关闭 M0/M1/M2。

正式产物资源版本为 `8d98340ce192ea13`（工作区构建，见 dist/resources.json）。Chromium 的 27 条浏览器旅程全部通过：原有 19 条涵盖两模式中文保存、脏内容保护、工作区焦点恢复、离线、接管、文件操作、安装卸载及两次 axe；5 条应用版本旅程涵盖稍后／拒绝新增权限／取消脏关闭、保存更新与回退、断网下载失败、启动校验失败、多个实例版本固定，以及新缓存丢失且断网刷新后的显式回退；另有 2 条真实 Service Worker 升级旅程和 1 条大文本复制旅程。

旧 Worker 旅程保留真实旧协议和 v2 IndexedDB 数据，新外壳立即显示明确的更新入口，确认后恢复原文件与窗口。另一路模拟服务器根路径已更换 HTML，刷新仍使用当前完整外壳；取消脏关闭保留草稿，升级时首次保存的文件也在新 Worker 激活后恢复。该轮状态协议先确认 `protocol:1` 再读取应用资源目录（后续 US-307 升级为协议 2）；无响应消息 5 秒内结束等待。激活监听先于发送，超时或销毁会清理监听与消息端口。

135 个单元与 Chromium 集成测试、23 个测试文件通过。除已有 v1/v2→v3 原子迁移、固定资源完整性、不可逆迁移阻止、旧实例授权清理与备份验证外，新增根导航缓存隔离、旧协议快速拒绝、安装／消息／激活失败清理、保存后与销毁前的会话提交。大文本复制通过现有分块通道提交，仍核验实例与权限；无授权或分块完成前已撤销授权时拒绝写入并释放字节。浏览器旅程实际导入并复制超过 1 MiB 的中英文及 emoji，逐字比较剪贴板与原文。

覆盖率统计范围为 `src/core/**/*.ts` 和 `src/host/windows.ts`，当前为 statements 96.52%、branches 96.03%、functions 93.89%、lines 98.05%；不代表全部 UI、bridge 或宿主运行时代码覆盖率。Orbit 公共 API 未改变，已验证的四项仍为 statements 97.19%、branches 95.37%、functions 97.50%、lines 98.57%。端到端耗时 49.2 秒不是 SC-004/005 的标准性能采样。

| 检查                                  | 本轮结果                                                                                                                     | 复验入口 / 本机日志                                                                                                                                     |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| lint / typecheck / requirements-check | 通过，ESLint 零警告；42 故事、256 AC，41 In Progress、1 Backlog，引用有效、依赖无环                                          | `pnpm nx run-many -p web-desktop -t lint,typecheck,requirements-check --parallel=1`；`/Volumes/data/web-desktop-check.xh9lki/offline-static-final1.log` |
| 单元、浏览器集成及覆盖率              | 23 个文件、135 条通过；上述统计范围四项均 ≥80%                                                                               | `pnpm nx run web-desktop:test --coverage`；`/Volumes/data/web-desktop-check.xh9lki/offline-coverage1.log`                                               |
| production build / E2E                | 27 条通过，包含两套交互、两次 axe、5 条应用版本、2 条外壳升级及 1 条大文本复制旅程                                           | `pnpm nx run web-desktop:e2e`；`/Volumes/data/web-desktop-check.xh9lki/offline-e2e-final1.log`                                                          |
| TDD 失败证据                          | 根导航、旧协议和会话提交的 8 个预期失败；真实旧 Worker 启动停留加载页；大文本传输 3 个预期失败；发送失败的计时器泄漏随后修复 | `offline-red2.log`、`offline-e2e-red1.log`、`clipboard-red1.log`、`offline-channel-red1.log`，均位于上述本机日志目录                                    |
| 格式 / 空白                           | Nx 格式检查和 Git 空白检查通过                                                                                               | `pnpm nx format:check --stdin`；`/Volumes/data/web-desktop-check.xh9lki/offline-format-check-final1.log`；`git diff --check`                            |
| 环境失败处理                          | 先前系统盘多次 ENOSPC 的运行未计入通过；大临时文件、Nx 缓存与 E2E 产物放在数据盘，Nx 数据库使用独立本机目录                  | `test-output/web-desktop-external/results`；复验环境标志见应用 README                                                                                   |

本机日志与 test-output 是可重建的本地证据，尚非随提交归档的发布验收材料。数据盘产物使用工作区内父目录符号链接，Nx 明确不缓存该 E2E 输出；27 条均实际运行。发布时必须保留按指纹寻址的 releases 归档；这些本地验证不等于正式 HTTPS 部署已经验收。

以上是外壳升级与大文本剪贴板一轮的历史结果。随后 US-307 已实现版本引用清理、空闲预取优先级与取消、协作挂起／恢复，见下节。当前剩余缺口包括刷新后的应用路由恢复、部分窗口还原状态与工作区排序、完整失败分支、三框架桌面组合及原消费端回归。性能标准原始样本、30 轮堆引用检查、真实操作系统／浏览器／输入法／读屏、10 人首次任务研究和正式 HTTPS 发布未完成。42 条故事均为 In Progress，不关闭完整产品 AC。

## 2026-11-07 预取、协作挂起与版本引用清理证据

正式资源构建版本 `788100c8de7e4e94`，来自当前未提交的工作区。宿主 macOS 15.7.9（24G830），Node 26.13.0，Playwright 1.65.0 的 Chromium 158.0.8127.18；单 worker 串行执行。以下覆盖 US-307 的实现及 Chromium 自动化层，全部故事仍待完整支持环境与发布验收。

宿主在交互空闲 500ms 后预取已安装的静态包，优先固定入口；预取不创建 iframe、不运行应用、不请求授权。Worker 资源协议升为 2，Orbit 协议保持 1；调度器全局并发上限为 2，同 key 共享任务，前台加入会提升优先级，独立前台任务可抢占纯后台任务。各请求有独立取消身份，后台取消不影响仍在等待的前台；发送取消通知抛错也会结束请求并释放临时引用。

资源引用包含安装、上一回退版本、运行实例、准备 / 安装 / 更新期间临时持有、运行与排队任务，以及所有同部署活 iframe。清理仅允许桌面入口发起，串行执行并阻止新的资源写入，保留其他部署缓存，不删除用户文件或 IndexedDB。更新和卸载取消对应后台预取；未启动应用的旧资源未固定时，更新流程自行准备回退包后才下载新版，不依赖空闲任务的完成时机。

支持 `suspension:1` 的内置应用先检查脏状态，再确认 `{saved:true}`。AppSession 停止新的业务请求，已登记状态事件保留最新一次，恢复后处理；原 iframe、组件内存、目录和搜索保持。挂起或补偿未确认显示未知状态，可重试恢复；最小化明确显示已隐藏。批量检查列出脏文档与未声明协议的速记本，保留实例和草稿。挂起状态不写入 schema，刷新仍按持久会话重新启动。

| 检查                                  | 结果                                                                                                                                                                          | 复验入口 / 本机证据                                                                                                                                                                       |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 单元、Chromium 集成与覆盖率           | 28 个文件、162 条通过；统计范围为 `src/core/**/*.ts` 与 `src/host/windows.ts`，statements 96.33%、branches 95.68%、functions 94.62%、lines 98.13%，不代表全部宿主 / UI 覆盖率 | `pnpm nx run web-desktop:test --coverage`；`/Volumes/data/web-desktop-check.xh9lki/background-coverage2.log`                                                                              |
| production build 与完整 E2E           | 33 条全部通过，含新增 6 条 US-307 旅程，原有更新 / 回退、真实旧 Worker 升级及大文本复制均回归成功；1.2 分钟总耗时不是性能标准采样                                             | `pnpm nx run web-desktop:e2e`；`/Volumes/data/web-desktop-check.xh9lki/background-e2e-final2.log`                                                                                         |
| lint / typecheck / requirements-check | 通过，ESLint 零警告；42 故事 / 256 AC，42 In Progress、0 Backlog，链接有效且依赖无环                                                                                          | `pnpm nx run-many -p web-desktop -t lint,typecheck,requirements-check --parallel=1`；`/Volumes/data/web-desktop-check.xh9lki/background-static-final2.log`                                |
| 调度和 Worker 消息边界                | 并发 2、去重、前台抢占、按 source 隔离取消、重复身份拒绝；清理同时保留宿主 / 活 iframe / 运行 / 排队引用，清理完成前不写入新资源                                              | `src/core/resource-scheduler.spec.ts`；`src/host/service-worker.spec.ts`                                                                                                                  |
| 协作挂起和恢复                        | 单实例脏文档拒绝、批量列出未支持应用、保存后挂起 / 切模式 / 恢复；文件目录及搜索保持，DOM 标记证明原 iframe 内实例保留                                                        | `src/host/suspension.spec.ts`；`src/apps/session.spec.ts`；`e2e/background.spec.ts`                                                                                                       |
| TDD 与完整回归发现的缺陷              | 缺失模块、状态事件暂停、资源清理、取消通知异常、清单 undefined 字段和旧版资源未固定均有失败记录；最后两项通过真实旅程发现，再补单元 / 集成用例修复                            | `background-red1.log`、`background-red2.log`、`prefetch-red1.log`、`background-red3.log`、`background-red4.log`、`background-red5.log`、`background-e2e-final1.log`，均在上述本机证据目录 |

逐 AC 的测试入口见 [验收登记](acceptance-evidence.md)。US-307 从 Backlog 改为 In Progress，当前 42 In Progress、0 Backlog、0 Done；T072/T073 已关联实际文件，完整环境与产品 AC 未验收前不勾选。当前仍需补刷新后路由恢复、部分窗口还原状态 / 工作区排序、完整失败分支、三框架桌面组合、性能原始采样、堆引用、实机输入法 / 读屏、10 人研究及正式 HTTPS 发布。本机日志为可重建的开发证据，尚未归档为发布验收材料。
