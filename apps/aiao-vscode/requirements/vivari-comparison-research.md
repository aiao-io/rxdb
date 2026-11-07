# Vivari 与 aiao-vscode 对比研究

> 调研日期：2026-11-07。
> 范围：Vivari 的浏览器运行时、公开 SDK 与 Studio，对照本仓库的 `apps/aiao-vscode` 应用。
> 本文记录源码实证、已有验收材料与研究建议；建议优先级供后续范围评审使用，不代表新增故事已立项或确定排期。

## 结论

**✅ 值得借鉴。Vivari 强在运行时深度、语言服务和完整项目体验；aiao-vscode 强在保存语义、草稿恢复和工作台交互。**

建议保留现有工作台主干，优先补项目级语言服务、理顺预览模式，再评估依赖复用和源码分享。
自研运行时、多语言、Notebook 和断点调试分别评估，避免同时扩张多个高成本方向。

一个必须保留的前提：**aiao-vscode 已接入真实 WebContainer，支持 Node、npm/pnpm、开发服务器和源码双向同步。**
不能把「新增能运行 Node 的终端」列为相对 Vivari 的功能缺口。
复验入口为 [`createWebContainerRuntime()`](../src/workbench/terminal/webcontainer-runtime.ts)、
[`projectRunPlan()`](../src/workbench/terminal/project-command.ts) 与
[已有终端验收报告](../benchmarks/browser-workbench-terminal.json)。

## 研究基线与证据边界

| 项目        | 读取的本地提交                             | 比较范围                                                                                  |
| ----------- | ------------------------------------------ | ----------------------------------------------------------------------------------------- |
| aiao-vscode | `ebdb01edf70998c588547dccc810ec8dc3d271f6` | Angular 应用、框架无关工作台内核、Git Worker、受控编译、WebContainer 终端、测试与验收报告 |
| Vivari      | `d2719f9fdd9a0f4feafde7e2e5a9efd46d8c06ff` | `packages/core`、`kernel-host`、`protocol`、`runtime`、`vfs`、`studio` 及测试脚本         |

本文采用以下证据口径：

- **源码实证**：已查看相关实现；链接文字优先使用符号名，方便在文件内定位。
- **已有验收材料**：仓库中的测试代码或报告快照；不等于本轮重新执行通过。
- **推断 / 建议**：由实现推导的用户影响、性能风险或后续设计，需要原型与测试确认。

本轮没有重新运行两个项目的测试、性能基准或完整兼容性矩阵，也没有对官网部署做现场验收。
不能据此声称某个运行时更快、内存更低或任意 npm 项目都兼容。
Vivari 链接固定到上述提交；aiao-vscode 使用仓库内相对链接，复验时结合基线提交核对。

## 定位与架构差异

Vivari 的核心是浏览器内的 Node 风格运行平台。它用 Worker 分离内核、文件系统、进程与网络下载，
以 SharedArrayBuffer 和 Atomics 提供同步调用桥接，让 Node 的 JavaScript 标准库运行在自建 binding 与 Rust/WASM VFS 之上。
Studio 是该平台的开发界面，公开 SDK 则提供 `boot`、`mount`、`spawn`、`fs` 和服务事件。
源码入口为 [`Kernel`][v-kernel]、[`createRuntime()`][v-runtime]、[`Vivari`][v-sdk] 与
[`BootOptions`][v-types]；整体关系见 [Vivari 架构文档][v-architecture]。

这种设计不等于浏览器直接执行原生 Node 二进制，也不代表其 Bun 支持运行的是原生 Bun 二进制。
运行时兼容层与 native/WASM 工具链适配仍由 Vivari 维护，参见
[`NATIVE_WASM_ALIASES`][v-shims] 与 [Bun CLI 实现][v-bun]。

我们的核心是可持久化、可恢复的本地开发工作台：Git Worker 管理 OPFS 中的源码与 Git 历史，
RxDB 保存项目元数据、恢复草稿和偏好，CodeMirror 提供编辑，Dockview 管理布局。
执行分为受控编译 Worker 和 WebContainer 项目进程两条路径。
入口为 [`WorkbenchSession`](../src/workbench/session.ts)、
[`GitWorkbenchRuntime`](../src/workbench/git/git-runtime.ts)、
[`createCompiler()`](../src/workbench/compiler-client.ts) 与
[`createWebContainerRuntime()`](../src/workbench/terminal/webcontainer-runtime.ts)。

因此，比较应分成「运行平台」和「工作台体验」两层；整个 RxDB 仓库其他包的能力不自动算作 IDE 已有能力。

## 相同功能的实现对照

| 功能             | Vivari                                                                                                  | aiao-vscode                                                                                    | 判断                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 浏览器 Node 环境 | 自研进程、文件系统与虚拟网络；Node JS 标准库运行在 binding 层之上                                       | 使用 `@webcontainer/api`，由 WebContainer 提供 Node 环境                                       | Vivari 底层控制更强；我们承担的运行时维护范围更小         |
| 编辑与语言服务   | Monaco 配合 TS/JS language-service Worker；提供跨文件补全、悬停、跳转与语义诊断                         | CodeMirror 语法支持、查找、Prettier 格式化与编译诊断；当前接入未提供项目级 TS language service | Vivari 的项目级语言服务值得优先借鉴                       |
| 源码与进程文件   | 编辑器保存、终端、开发服务器和 Git 共用 VFS                                                             | OPFS Git 持久化与 WebContainer 运行副本分开，通过协议双向同步源码                              | Vivari 数据路径更直接；我们显式约束保存、冲突和恢复       |
| 重复安装依赖     | 包管理器缓存持久化；按锁文件保存、恢复 `node_modules` 快照，带 LRU 容量上限                             | 停止后销毁容器；同步与项目归档排除 `node_modules`，重开需要重新安装                            | Vivari 提供了依赖复用设计，实际收益需基准验证             |
| 编译与预览       | 真实项目开发服务器，通过 Service Worker 与虚拟网络提供 HTTP、WebSocket 和 HMR；支持不同预览 origin 模式 | 受控编译预览与 WebContainer 服务预览并存，执行边界不同                                         | 我们兼顾离线与完整项目，交互语义还需统一                  |
| Git 与差异       | isomorphic-git 经异步 fs 适配访问 VFS；多仓库、本地分支管理；差异视图是 HEAD 与工作区                   | Git WASM Worker；区分 HEAD/index/worktree；另有 GitHub API 虚拟仓库后端                        | Vivari 强在本地分支与多仓库；我们远端链路和差异语义更完整 |
| 工作区与终端     | 多根目录、多项目、多个终端与服务                                                                        | 当前项目独占容器；切换项目先回写文件，再销毁进程和服务预览                                     | Vivari 适合多服务联调；我们生命周期约束更集中             |
| 布局             | React 组件与可调整大小的面板                                                                            | Dockview 支持拖动、拆分、停靠，按项目恢复布局与标签                                            | 保留我们的布局与实例生命周期设计                          |
| 导入、导出与分享 | 文件夹、公开 GitHub/npm 导入；源码 ZIP；压缩源码生成分享链接                                            | 文件夹、GitHub、ZIP；本地项目归档包含源码、锁文件、暂存区与 `.git`                             | 分享链接与完整归档互补                                    |
| 调试与其他语言   | 源码插桩调试；Python、Notebook、Bun API shim 等                                                         | 编译诊断、Console、输出与终端，当前没有同等的集成调试与多语言链路                              | 独立候选，不能从功能表推导为低成本扩展                    |

主要复验入口：

| 对照项       | Vivari 源码符号                                                                                         | aiao-vscode 源码或文档                                                                                                                   |
| ------------ | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 语言服务     | [`IdeController.configureLanguageService()`、`ensureBackgroundModels()`、`ensureModel()`][v-controller] | [`AppComponent`](../src/app/app.component.ts) 中 `CodeEditor` 创建与扩展注入；[`formatWorkbenchSource()`](../src/workbench/formatter.ts) |
| 文件同步     | [`IdeController.saveFile()`][v-controller]、[`FsServer`][v-fs-server]                                   | [`createWebContainerRuntime()`](../src/workbench/terminal/webcontainer-runtime.ts) 内 `readFiles()`、`scan()`、`sync()`                  |
| 依赖缓存     | [`hashDepKey()`、`createDepCache()`][v-depcache]、[`shouldPersist()`][v-fs-worker]                      | [终端生命周期与同步范围](../README.md#浏览器交互终端)                                                                                    |
| Git          | [`ScmSession`][v-scm]、[`createGitFs()`][v-git-fs]                                                      | [`WorkbenchBackend`](../src/workbench/session.ts)、[`createGitHubBackend()`](../src/workbench/git/github/github-backend.ts)              |
| 预览         | [`BootOptions.previewOrigin`、`previewWildcardDomain`][v-types]、[`PreviewPanel`][v-preview]            | [`mountPreview()`](../src/workbench/preview/preview-sandbox.ts)、[两类预览的行为说明](../README.md#浏览器交互终端)                       |
| 工作区与分享 | [`IdeController` 的 `workspaceFolders`、`shareProject()`][v-controller]                                 | [布局与恢复说明](../README.md)、[`WorkbenchBackend.exportArchive()`](../src/workbench/session.ts)                                        |
| 调试         | [`DebugSession`][v-debug-session]、[`instrumentSource()`][v-instrument]                                 | [现有应用范围](../README.md)                                                                                                             |

## aiao-vscode 已有优势

### 保存成功以回执为准

源码实证：Vivari Studio 的 `IdeController.saveFile()` 发送 `vv-write` 后，立即清除 dirty 标记并显示 saved；
该调用没有等待写入回执。kernel 的 `vv-write` 分支支持带 `reqId` 的请求回复，但 Studio 这里走的是 `post()`。
失败会输出日志，不能把界面的 saved 理解为持久化成功确认。
复验入口为 [`IdeController.saveFile()`][v-controller] 与 [kernel 的 `vv-write` 分支][v-kernel-worker]。

我们的 `WorkbenchSession.#performSave()` 等待 `backend.save()` 成功，再更新保存基线、revision 与 dirty；
保存期间继续输入的内容不会被误标成已保存。`GitWorkbenchRuntime.mutate()` 还负责恢复日志、回滚与状态更新。
复验入口为 [`WorkbenchSession.#performSave()`](../src/workbench/session.ts)、
[`GitWorkbenchRuntime.mutate()`](../src/workbench/git/git-runtime.ts) 与
[保存失败和并发编辑测试](../src/workbench/session.spec.ts)。

建议：保留当前回执语义，后续增加运行时或文件缓存也不能提前宣布保存成功。

### 未保存草稿独立恢复

源码实证：`createWorkbenchRecoveryJournal()` 先同步写恢复日志，再由宿主异步落库；
确认回调只清理自己对应的日志，避免旧写入确认删除更新的草稿。
恢复草稿、已保存源码、Git 暂存区和提交历史分别管理。
复验入口为 [`createWorkbenchRecoveryJournal()`](../src/workbench/workbench-recovery.ts)、
[`WorkbenchSession.getDrafts()`](../src/workbench/session.ts) 与
[恢复日志损坏、容量不足及代次隔离测试](../src/workbench/workbench-recovery.spec.ts)。

Vivari 的 `ensureModel()` 将未保存内容放在 Monaco model 和内存 dirty 状态中；
本轮检查的 Studio 实现没有发现同等的未保存草稿持久化链路。
其 OPFS 镜像恢复的是已写入 VFS 的内容，参见
[`IdeController.ensureModel()`][v-controller] 与 [`createOpfsPersistence()`][v-opfs]。

建议：语言服务、自动保存、项目分享都应明确使用编辑缓冲还是保存快照，不能混淆两者。

### Git 差异与完整归档语义更细

源码实证：我们的 SCM 分开展示暂存与工作区差异，文件有未保存编辑时禁止暂存对应文件；
本地归档包含 `.git` 与暂存区，导入创建新项目。
Vivari 有暂存区和本地分支，但其 diff tab 使用 HEAD 与工作区内容；源码导出排除 `.git`。
复验入口为 [SCM 与导出行为说明](../README.md#数据与恢复)、
[`createWorkbenchScm()`](../src/workbench/workbench-scm.ts)、
[`ScmSession.headBlobText()`][v-scm] 与 [`Vivari.export()`][v-sdk]。

远端能力应表述为「代码覆盖更完整」。
[US-406](stories/US-406-github-remote-repositories.md) 仍有未关闭的验收项；
[GitHub 认证报告](../benchmarks/browser-workbench-github-auth-vscode.json) 包含跳过结果，
[OAuth 报告](../benchmarks/browser-workbench-github-oauth-vscode.json) 记录的配置、回调和 Service Worker 检查通过，
不能据此推导真实账号授权、提交推送与拉取全链路都已完成验收。

### 受控预览隔离与布局恢复值得保留

源码实证：受控预览使用 `sandbox="allow-scripts"` 和 credentialless iframe；
Vivari 的预览 iframe 允许 `allow-same-origin`，并通过配置提供同源、独立 origin、按端口独立 origin 等模式。
因此隔离强弱必须结合实际部署模式判断，不能仅凭「都使用 iframe」得出相同结论。
复验入口为 [`mountPreview()`](../src/workbench/preview/preview-sandbox.ts)、
[`PreviewPanel`][v-preview] 与 [`BootOptions`][v-types]。
这个结论只涉及受控预览，不能外推为我们的 WebContainer 服务预览具有相同边界。

布局方面，我们已有拖动拆分、停靠、编辑器实例保留、按项目恢复与分组预览标签。
复验入口为 [`createWorkbenchDockview()`](../src/workbench/workbench-dockview.ts)、
[`normalizeWorkbenchLayout()`](../src/workbench/workbench-layout-state.ts) 与
[已有布局验收报告](../benchmarks/browser-workbench-docking-vscode.json)。

## Vivari 值得借鉴的设计与候选功能

### 项目级 TS/JS 语言服务

源码实证：Vivari 用 Monaco 的 TS Worker 提供语义能力。
项目源码成为 models，依赖 `.d.ts` 与 `package.json` 成为 extra libs；
后台收集未打开的源码，使跨文件跳转不依赖用户先打开目标文件。
依赖声明在 kernel worker 批量读取，带防抖、预算与指纹检查。
JS 与 TS 共用一个 TS language service，避免重复加载相同的依赖类型。
复验入口为 [`configureLanguageService()`、`ensureBackgroundModels()`][v-controller] 与
[语言服务设计说明][v-architecture]。

建议：保留 CodeMirror，在独立 Worker 中接项目级语言服务，先覆盖 TS/JS/TSX。
项目文件、未保存编辑与依赖类型分别同步；避免同一文件同时作为源码和额外声明注册。
Vue SFC、Angular 模板的语义服务另行评估，不能把 TS Worker 能力直接视作三类框架模板都已覆盖。

### 依赖缓存与可观察的启动流程

源码实证：Vivari 将包管理器缓存持久化，并额外按包管理器与锁文件摘要保存 `node_modules` 快照；
缓存有容量上限和 LRU 淘汰。当前 `shouldPersist()` 明确排除逐文件镜像 `node_modules`，
由快照承担恢复，避免两份持久化。
复验入口为 [`hashDepKey()`、`createDepCache()`][v-depcache] 与 [`shouldPersist()`][v-fs-worker]。

建议：先测量冷启动、同项目重启、切项目后重开与相同依赖的新项目四种场景。
评估运行时可提供的缓存或快照接口，缓存键至少覆盖运行时版本、包管理器版本与锁文件；
必须处理 symlink、损坏缓存和容量淘汰，不能把我们的普通源码 ZIP 直接当作依赖快照。
阶段展示应区分启动容器、恢复依赖、安装依赖、启动服务和服务就绪，避免仅显示一个长期忙碌状态。

### 源码分享链接

源码实证：`shareProject()` 读取有容量限制的源码树，经 `encodeShare()` 压缩后写入 `#share=`；
接收端导入新项目。它排除依赖目录与 `.git`，是源码传递，不是实时协作。
复验入口为 [`IdeController.shareProject()`][v-controller] 与 [`encodeShare()`][v-archive]。

建议：为小型 RxDB 示例和问题复现增加分享入口，保留现有完整 ZIP 归档。
分享前明确采用已保存快照还是保存全部缓冲；接收端校验大小、路径和格式，导入独立项目，运行采用显式操作。
大项目可以直接提示改用归档，不需要立即引入分享服务端。

### 进程、端口、本地分支与多根工作区

源码实证：Vivari 记录多个终端、运行项目与端口；`ScmSession` 按根目录管理多个仓库，
提供 `createBranch()`、`checkoutBranch()` 和 `deleteBranch()`。
复验入口为 [`IdeController` 的 `terminals`、`ports`、`workspaceFolders`][v-controller] 与 [`ScmSession`][v-scm]。

建议：先从我们已有的 Shell、项目终端和服务端口扩展可视化，再补本地分支。
多根工作区需要重新约束项目身份、容器生命周期、路径命名和草稿恢复，放在单项目能力稳定之后。

### 调试、Python 与 Notebook

源码实证：Vivari 的 Node 客户进程调试通过源码插桩和 CDP 风格消息实现，
不是直接接入原生 Node inspector。Python 与 Notebook 各有运行、语言服务和文档状态链路。
复验入口为 [`DebugSession`][v-debug-session]、[`instrumentSource()`][v-instrument]、
[Python 程序入口][v-python] 与 [Notebook session][v-notebook]。

建议：分别立项。先验证异常堆栈、源码位置、暂停期间的进程行为，再决定是否增加断点界面；
Python 与 Notebook 需要明确用户场景和资源预算。

## 本次对比暴露出的现有成本

### 两条预览路径的交互语义

源码实证：顶部「运行」走 WebContainer 项目进程，预览刷新继续走受控编译；
受控编译的 `declaredDependencies()` 只允许模板锁定的依赖。
复验入口为 [浏览器交互终端说明](../README.md#浏览器交互终端) 与
[`declaredDependencies()`](../src/workbench/compiler/compiler-dependencies.ts)。

推断：用户通过终端安装某个依赖后，真实开发服务器可能正常，受控编译仍会拒绝该依赖。
建议在界面明确当前预览模式，让运行、刷新与诊断跟随用户选定的模式。
这属于两条已有执行路径的交互整合，不意味着取消离线受控预览。

### 文件变化触发全量源码扫描

源码实证：`scheduleScan()` 防抖 150ms 后触发 `flush()`；`scan()` 经 `readFiles()`
遍历并读取同步范围中的所有普通文件，再计算写入与删除差异。
复验入口为 [`createWebContainerRuntime()`](../src/workbench/terminal/webcontainer-runtime.ts) 内上述符号。

推断：扩大项目容量或增加高频代码生成后，成本会随同步范围增长。
建议先测事件合并频率、扫描字节数与回写耗时，再评估按变化路径读取；
目录重命名、删除与路径冲突仍需整体校验，不能只优化正常文件修改。

### Git 恢复日志包含整个仓库

源码实证：`GitWorkbenchRuntime.mutate()` 调用 `collect(context.root, true)`，
把包含 `.git` 的仓库打包为 ZIP，写 `recovery.bin` 后再执行修改。
源码写入本身会筛选变化文件，但日志准备仍有全仓库成本。
复验入口为 [`GitWorkbenchRuntime.save()`、`mutate()`、`collect()`](../src/workbench/git/git-runtime.ts)。

推断：Git 历史增长后，即使只保存一个小文件，恢复日志也可能成为主要成本。
当前 [`GIT_WORKBENCH_LIMITS`](../src/workbench/git/git-protocol.ts) 限制 2,000 文件、单文件 2 MiB、总量 20 MiB、归档 24 MiB；
放宽容量前应评估增量日志，同时保留崩溃恢复和回滚语义。

## 工程质量与运行时替换判断

Vivari 值得学的是分层、批量跨线程操作和兼容性验证。
例如 [`spike-fs-errors.mjs`][v-fs-errors] 在真实 Node 与虚拟环境运行同一组场景，比较错误码、路径、syscall 与消息。
这种参照真实行为的测试，比只维护一组自定义预期更适合验证运行时适配。

源码实证：其多个核心 Worker 使用 `@ts-nocheck`；Worker 配置含 `strict: false`、`checkJs: false` 与 `noImplicitAny: false`。
公开 SDK 的严格类型配置不能外推为整个运行时均已严格检查。
复验入口为 [kernel worker][v-kernel-worker] 与 [Worker 类型配置][v-worker-tsconfig]。
因此不建议将大块运行时代码直接搬入受本仓库 TS strict 约束的公共包。

如后续评估 Vivari 替代 WebContainer，可沿现有
[`TerminalContainer`、`TerminalRuntime`](../src/workbench/terminal/webcontainer-runtime.ts) 边界增加独立适配原型。
两者都提供 mount、spawn、文件访问与服务事件，但 Vivari 公开的
[`SpawnOptions`][v-types] 和 [`VivariProcess`][v-process] 与我们依赖的终端尺寸调整、`jsh` Shell 和状态标记行为不同。
因此它不是直接替换 import 就能完成的兼容实现。

替换前至少验证：启动与退出、交互输入、Ctrl+C、终端 resize、安装、HMR、文件双向同步、草稿保护、
切项目清理、预览隔离与离线边界。是否替换由兼容性、维护责任和实测结果决定。

## 建议顺序与后续验证

| 优先级 | 候选工作                                   | 首轮验证重点                                                                 | 决策边界                            |
| ------ | ------------------------------------------ | ---------------------------------------------------------------------------- | ----------------------------------- |
| P0     | 项目级 TS/JS 语言服务                      | 未打开文件的跨文件跳转、依赖类型、未保存编辑诊断、过期结果取消与 Worker 回收 | 保留 CodeMirror；框架模板语义另评估 |
| P0     | 预览模式交互整合                           | 同一项目在两种模式中的运行、刷新、诊断与新增依赖行为一致可解释               | 保留受控离线预览边界                |
| P1     | 依赖复用与启动流程                         | 冷启动、重启、切项目后重开、缓存失效、容量上限与恢复失败                     | 先基准和原型，不先承诺启动时间      |
| P1     | 源码分享链接                               | 文本与二进制往返、路径校验、超限、独立项目导入、未保存内容策略               | 适配小型示例与复现，不扩为实时协作  |
| P1     | 进程与端口视图、本地分支                   | 进程退出清理、服务归属、分支切换的草稿和暂存保护                             | 两个可独立交付的候选范围            |
| P2     | 多根工作区                                 | 根目录身份、并行服务、跨项目路径与恢复隔离                                   | 依赖单项目生命周期稳定              |
| P2     | 断点调试、Python、Notebook、自研运行时评估 | 用户场景、兼容矩阵、资源成本、隔离与维护责任                                 | 分别立项，避免捆绑扩张              |

现有性能成本的验证与功能候选分开安排：先测量源码扫描和 Git 日志开销，再决定是否调整实现。
进入实现前，为选定范围补红测、验收场景和故事；实际状态以
[状态概览](status-overview.md) 与对应故事 YAML 为准，排期见 [路线图](roadmap.md)。

[v-architecture]: https://github.com/maitrungduc1410/vivari/blob/d2719f9fdd9a0f4feafde7e2e5a9efd46d8c06ff/ARCHITECTURE.md
[v-kernel]: https://github.com/maitrungduc1410/vivari/blob/d2719f9fdd9a0f4feafde7e2e5a9efd46d8c06ff/packages/kernel-host/kernel.js
[v-runtime]: https://github.com/maitrungduc1410/vivari/blob/d2719f9fdd9a0f4feafde7e2e5a9efd46d8c06ff/packages/runtime/index.js
[v-sdk]: https://github.com/maitrungduc1410/vivari/blob/d2719f9fdd9a0f4feafde7e2e5a9efd46d8c06ff/packages/core/src/vivari.ts
[v-types]: https://github.com/maitrungduc1410/vivari/blob/d2719f9fdd9a0f4feafde7e2e5a9efd46d8c06ff/packages/core/src/types.ts
[v-shims]: https://github.com/maitrungduc1410/vivari/blob/d2719f9fdd9a0f4feafde7e2e5a9efd46d8c06ff/packages/runtime/toolchain-shims.js
[v-bun]: https://github.com/maitrungduc1410/vivari/blob/d2719f9fdd9a0f4feafde7e2e5a9efd46d8c06ff/packages/kernel-host/programs/bun.js
[v-controller]: https://github.com/maitrungduc1410/vivari/blob/d2719f9fdd9a0f4feafde7e2e5a9efd46d8c06ff/packages/studio/src/vv/controller.ts
[v-fs-server]: https://github.com/maitrungduc1410/vivari/blob/d2719f9fdd9a0f4feafde7e2e5a9efd46d8c06ff/packages/kernel-host/fs-server.js
[v-depcache]: https://github.com/maitrungduc1410/vivari/blob/d2719f9fdd9a0f4feafde7e2e5a9efd46d8c06ff/packages/kernel-host/dep-cache.js
[v-fs-worker]: https://github.com/maitrungduc1410/vivari/blob/d2719f9fdd9a0f4feafde7e2e5a9efd46d8c06ff/packages/core/src/workers/fs-worker.ts
[v-scm]: https://github.com/maitrungduc1410/vivari/blob/d2719f9fdd9a0f4feafde7e2e5a9efd46d8c06ff/packages/studio/src/vv/scm-session.ts
[v-git-fs]: https://github.com/maitrungduc1410/vivari/blob/d2719f9fdd9a0f4feafde7e2e5a9efd46d8c06ff/packages/studio/src/vv/git-fs.ts
[v-preview]: https://github.com/maitrungduc1410/vivari/blob/d2719f9fdd9a0f4feafde7e2e5a9efd46d8c06ff/packages/studio/src/components/ide/PreviewPanel.tsx
[v-debug-session]: https://github.com/maitrungduc1410/vivari/blob/d2719f9fdd9a0f4feafde7e2e5a9efd46d8c06ff/packages/studio/src/vv/debug-session.ts
[v-instrument]: https://github.com/maitrungduc1410/vivari/blob/d2719f9fdd9a0f4feafde7e2e5a9efd46d8c06ff/packages/runtime/instrument.js
[v-kernel-worker]: https://github.com/maitrungduc1410/vivari/blob/d2719f9fdd9a0f4feafde7e2e5a9efd46d8c06ff/packages/core/src/workers/kernel-worker.ts
[v-opfs]: https://github.com/maitrungduc1410/vivari/blob/d2719f9fdd9a0f4feafde7e2e5a9efd46d8c06ff/packages/kernel-host/opfs-persistence.js
[v-archive]: https://github.com/maitrungduc1410/vivari/blob/d2719f9fdd9a0f4feafde7e2e5a9efd46d8c06ff/packages/kernel-host/archive.js
[v-python]: https://github.com/maitrungduc1410/vivari/blob/d2719f9fdd9a0f4feafde7e2e5a9efd46d8c06ff/packages/kernel-host/programs/python.js
[v-notebook]: https://github.com/maitrungduc1410/vivari/blob/d2719f9fdd9a0f4feafde7e2e5a9efd46d8c06ff/packages/studio/src/vv/notebook/session.js
[v-fs-errors]: https://github.com/maitrungduc1410/vivari/blob/d2719f9fdd9a0f4feafde7e2e5a9efd46d8c06ff/scripts/spike-fs-errors.mjs
[v-worker-tsconfig]: https://github.com/maitrungduc1410/vivari/blob/d2719f9fdd9a0f4feafde7e2e5a9efd46d8c06ff/packages/core/tsconfig.workers.json
[v-process]: https://github.com/maitrungduc1410/vivari/blob/d2719f9fdd9a0f4feafde7e2e5a9efd46d8c06ff/packages/core/src/process.ts
