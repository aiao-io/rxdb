# aiao-vscode

浏览器内的本地开发工作台应用（Angular 22）。使用 CodeMirror 编辑器、独立 OPFS Git 仓库、受控编译 Worker 与隔离预览；支持 JavaScript / TypeScript、React TSX、Vue SFC 和 Angular standalone 四类受控模板。

布局使用 `dockview-core`，图标使用微软官方 `@vscode/codicons`。界面沿用 VS Code Dark Modern 的活动栏、资源管理器、编辑标签、预览、问题 / 输出 / Console / 终端面板和状态栏。编辑标签可拖动拆分、合并与停靠；预览与编辑器在布局移动时保留实例、撤销记录和运行状态，支持一键重置布局。布局随项目保存在本地目录里（与打开的标签同处），直接打开、刷新、重启浏览器或切换项目时都按该项目上次的样子还原；只排布已打开的文件，地址栏不带布局。

首次打开空目录会生成最小 React、Vue、Angular Demo；后续重开恢复最近使用的项目。范围与验收见 [requirements/stories/US-404](requirements/stories/US-404-browser-development-workbench.md)。

## 开发与构建

```sh
pnpm nx serve aiao-vscode          # 开发服务器 http://127.0.0.1:4320
pnpm nx build aiao-vscode          # 生产构建（默认配置，含 Service Worker）
pnpm nx test aiao-vscode           # 内核 + Angular 外壳单测（vitest）
pnpm nx run aiao-vscode:test-browser  # 真实 Chromium 探针（Git / 预览 / Angular）
pnpm nx e2e aiao-vscode-e2e        # Playwright e2e：四模板编辑 / 运行 / 提交 / 归档，按项目还原布局
```

开发服务器与生产构建都需要 `assets` 目标先生成自托管资源（`public/browser-workbench-assets/`），Nx 已配置依赖。

## 目录结构

| 位置                           | 职责                                                          |
| ------------------------------ | ------------------------------------------------------------- |
| `src/app/`                     | Angular 外壳：RxDB 项目目录、编辑器挂载、连接与离线生命周期   |
| `src/workbench/`               | 框架无关内核：会话、Git / 编译协议、Dockview 布局、SCM 与差异 |
| `src/benchmark/`               | 真实浏览器探针：Git 持久化、预览隔离、Angular JIT / AOT       |
| `scripts/`                     | 自托管资产构建与可重跑验证脚本                                |
| `requirements/`、`benchmarks/` | 故事、状态、路线图与验收证据快照                              |

## 部署静态资源

`assets` 目标把编译器 WASM、Git WASM、Worker、Angular 转译器、前端运行时、Dockview 样式、
Codicons 样式 / 字体 / 许可证和 SHA-256 资源清单生成到 `public/browser-workbench-assets/`，
随应用构建一起部署，路径由工作台的 `assetBaseURL`（默认 `/browser-workbench-assets/`）指定。

WASM 响应使用 `application/wasm`，JS 使用 `text/javascript`，CSS 使用 `text/css`，TTF 字体使用
`font/ttf`；跨源加载需要 `Access-Control-Allow-Origin: *` 与 `Cross-Origin-Resource-Policy: cross-origin`。
站点还必须返回 COOP / COEP 响应头（OPFS Git 与 JSPI WASM 依赖跨源隔离），本地 `serve` 与 e2e
静态服务（`--coop-coep`）已内置，生产托管需自行配置等价响应头。

离线重开依赖 Service Worker 缓存应用外壳与完整资源目录。首次访问缺少资源时不承诺离线启动；
缺资源或摘要不符会明确报错。

## 数据与恢复

代码文件与 `.git` 在 `aiao-browser-workbench/projects/<projectId>/` 下，由 Git Worker 独占。
编辑缓冲、已保存 revision 与 Git commit 是三个不同状态。保存按钮或 `Ctrl/⌘ + S` 只保存当前
源码文件；当前打开差异时保存其对应文件，其他未保存缓冲继续保留。`Ctrl/⌘ + Shift + S` 为
Save All，运行按钮和导出也会明确保存全部缓冲；保存与运行不会自动暂存或提交。

`Ctrl/⌘ + P` 打开文件搜索；`Ctrl/⌘ + Shift + P` 打开命令面板。编辑器启用 Tab 缩进，`Ctrl/⌘ + Enter`
在源码内沿用 CodeMirror 的插入行行为，在 Git 提交说明内提交暂存区。`Ctrl/⌘ + W` 关闭标签、
`Ctrl/⌘ + 反斜杠` 拆分、F2 重命名、`Ctrl/⌘ + B/J` 切换侧栏和底部面板。

顶部项目名打开命令中心，空查询提供文件、命令、最近项目和搜索入口；`>` 搜索命令，`?` 查看
快速访问方式。左右箭头沿当前项目的文件访问历史后退、前进。独立下拉保留工作区操作，
`Ctrl + R` 打开可搜索的最近项目列表；切换项目会保留未保存内容的确认流程。

Git 视图区分「暂存的更改」和「更改」，支持逐文件或批量暂存、取消暂存。文件有未保存编辑时
不能暂存该文件；提交只包含暂存区。点击文件打开只读双栏差异（`HEAD → index` 与 `index → worktree`）；
BOM、行尾和末尾换行变化单独说明，二进制只显示字节信息。丢弃更改和删除未跟踪文件必须确认。
更改默认按路径平铺，可在标题菜单切换目录树、按名称或状态排序；目录可折叠，菜单支持确认后批量丢弃更改。

从 GitHub 打开的仓库使用虚拟仓库模式，与 vscode.dev 的 GitHub Repositories 一致：保存文件后，
暂存更改并填写提交说明，点击「提交并推送」即可更新当前远端分支。「拉取」更新远端基线并保留
本地更改与暂存内容；同一文件双方修改或路径冲突时整体拒绝拉取，列出冲突文件。
「同步更改」先拉取，再提交并推送暂存内容；没有暂存内容时只拉取。拉取和同步前须保存未保存编辑。
入口位于源代码管理面板、标题栏、状态栏及命令面板的 `Git: 推送 / 拉取 / 同步更改`。

导出 ZIP 包含源码、资源、依赖锁、暂存区和 `.git`，不包含构建缓存。导入到全新项目空间，
不覆盖已有仓库。导出后可在 Node.js 26 与 pnpm 12 下执行 `pnpm install --frozen-lockfile`、
`pnpm build`，继续使用普通 Git。

OPFS 按站点隔离，清除站点数据会删除项目；数据库只保存项目目录元数据（`WorkbenchProject`
实体，`log: false`、`sync: None`），代码与 Git 历史不写进数据库。请使用项目导出保留完整源码与历史。

## 支持范围

当前验收宿主为桌面 Chromium，要求安全上下文、OPFS、Web Locks、WebAssembly JSPI 和
credentialless iframe。缺少能力时明确失败，没有内存存储替代路径。

受控编译预览运行在 `sandbox="allow-scripts"` 的 opaque origin iframe，无法读取 IDE 或其他项目的 DOM、
OPFS、数据库和登录凭据；消息通道只回传当前会话的诊断，不提供宿主文件写入接口。这个边界
不等于全网访问沙箱；不能据此宣称任意 JavaScript 的导航或 WebRTC 已被完全封锁。

受控预览只解析项目快照与固定依赖，支持本地模块、普通 CSS、图片与 Vue scoped style；
Angular 使用浏览器 JIT 与 TS 装饰器转换。受控编译不提供完整 TS 类型检查或任意插件执行。

## 浏览器交互终端

打开项目后，点击顶栏终端图标、底部「终端」标签或按 `Ctrl + 反引号`。
终端惰性加载 xterm.js 与 WebContainer，在浏览器里运行 Node.js Shell，可输入 `node`、
`npm`、`pnpm` 等命令。命令输出与报错实时显示，`Ctrl+C` 中断前台命令；
开发服务器就绪后显示端口并打开独立服务预览，点击端口可重新打开。
服务预览沿用 WebContainer 的跨源 Service Worker 与浏览器存储上下文，和受控编译的 opaque origin 预览分别管理。
顶部「运行」仍使用受控编译预览；终端开发服务器通过项目自己的命令启动。

终端初次挂载已保存源码。编辑器保存后同步到容器，终端新建、修改、删除的源码通过原子回执
写回项目；双方修改同一文件时保留编辑器未保存缓冲。`.git`、`node_modules`、`dist`、`build`、
`.angular`、`.vite`、`.cache` 和 `coverage` 不在同步范围，符号链接不会被遍历。
关闭底部面板保留进程；点击「停止」或切换项目会先保存终端文件变化，再销毁容器和服务预览。
终端源码沿用下方项目容量限制；停止后重新安装依赖，Git 操作继续使用源代码管理视图。

启动 WebContainer 与首次安装依赖需要网络。终端需要 COOP / COEP；当前 `serve` 已配置。
WebContainer 不支持原生 Node 扩展，不能据此保证任意 Nx / npm 仓库兼容。
商用宿主可通过 `BrowserWorkbenchOptions.webContainerApiKey` 传入官方授权；
授权要求见 [WebContainer 文档](https://webcontainers.io/enterprise)。
范围与验证见 [US-408](requirements/stories/US-408-browser-terminal.md)。

单项目限制：2,000 文件、单文件 2 MiB、文件总量 20 MiB、ZIP 24 MiB；不支持符号链接、可执行位
和子模块。写入用仓库级 Web Lock 串行化，崩溃后先检查恢复日志，不误报写入成功。

Dockview 的 MIT 声明与 Codicons 的图标 / 字体 CC BY 4.0、代码 MIT 声明随 `assets/licenses/`
分发；Codicons 来自 Microsoft。Git WASM 的 GPL v2 + linking exception 声明随 `assets/git/COPYING`
分发。前端编译器与运行时的许可文本也包含在发布资源中。

## 验证

所有任务通过 Nx 执行：

```sh
pnpm nx test aiao-vscode --coverage
pnpm nx run aiao-vscode:verify-export
pnpm nx run aiao-vscode:verify-offline
pnpm nx serve aiao-vscode      # verify-* 需要一个运行中的应用
pnpm nx run aiao-vscode:verify-commands --url=http://127.0.0.1:4320/
pnpm nx run aiao-vscode:verify-save-preview --url=http://127.0.0.1:4320/
pnpm nx run aiao-vscode:verify-scm --url=http://127.0.0.1:4320/
pnpm nx run aiao-vscode:verify-docking --url=http://127.0.0.1:4320/
pnpm nx run aiao-vscode:verify-terminal --url=http://localhost:4320/
```

`verify-export` 检查四类模板的仓外冻结锁安装、生产构建与 Chromium 交互；`verify-offline`
检查生产构建缓存后的断网重开；`verify-commands` 检查键盘和标签生命周期；`verify-scm` 检查
暂存、提交、差异和丢弃；`verify-save-preview` 检查保存预览的功能与耗时，可用
`--functional-only` 仅跑功能；`verify-docking` 检查真实拖拽、保活与字体摘要。
原始报告保存在 `apps/aiao-vscode/benchmarks/browser-workbench-*.json`。

终端可在生产构建上独立验收：先运行 `pnpm nx build aiao-vscode`，再运行
`pnpm nx run aiao-vscode:verify-terminal --production`。脚本会临时启动带 COOP / COEP 的本地静态服务，
验证真实 npm / pnpm 安装、文件双向同步、服务预览、Ctrl+C、项目切换和进程释放。
