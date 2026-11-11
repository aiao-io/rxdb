# 当前分支相对 `main` 的代码评审记录

- 评审分支：`aiao-vscode`
- 对比基线：`main...HEAD`
- merge-base：`4eb5ab5e64a49457aa3a7901b15cb15b0d163478`
- HEAD：`610b1b5be900a5e9a7f154e71fc3bc60b56aa280`
- 当前时间：2026-11-11（Asia/Shanghai）
- 初始范围：308 个文件，57,775 行新增、166 行删除；其中 307 个为应用、配置、测试、脚本或依赖相关文件，另 1 个为既有评审记录。
- 提交数量：`main..HEAD` 共 113 个提交。
- 评审边界：以下发现针对已提交的 `main...HEAD`；评审期间新增的 `feat(vscode): support PWA window controls overlay` 已纳入范围。

## 评审方法

1. 先按目录和文件类型筛出运行时代码、构建/部署配置、测试和脚本。
2. 结合调用方与测试检查数据流、错误处理、权限/跨源边界、资源生命周期和回归风险。
3. 对高风险点记录文件、行号、触发条件、实际影响和修复建议。
4. 最后运行与改动相关的 Nx 校验；若全量校验超出时间，记录具体未覆盖项。

## 发现

共确认 9 个问题：4 个 P1、5 个 P2；未发现 P0。

- 🔴 P1：GitHub API ETag 缓存未按账号隔离，切换账号后可能复用旧认证响应。
- 🔴 P1：GitHub 远程 rename/move 缺少路径和目标冲突校验，可能覆盖目标文件。
- 🟡 P2：打开 GitHub 远程项目会触发空入口预览编译错误。
- 🔴 P1：GitHub Contents API 的 `encoding: 'none'` 被当成空文件，1–2 MiB 文件可能被覆盖为空。
- 🔴 P1：GitHub 远程读取/导出没有执行文件数、总字节和归档大小上限。
- 🟡 P2：非截断 GitHub tree 被重复遍历和重复下载。
- 🟡 P2：特殊字符分支名更新 ref 时未编码。
- 🟡 P2：Angular 组件销毁后延迟挂载仍可能创建孤立工作台。
- 🟡 P2：GitHub 认证订阅未随工作台 dispose 释放。

## 已检查范围

- [x] 分支状态、merge-base、提交数量和差异规模
- [x] `apps/aiao-vscode` 运行时代码
- [x] `apps/aiao-vscode-e2e` 与工作台验收测试
- [x] 部署函数和构建脚本
- [x] `packages/*` 受影响公共包
- [x] `scripts/*` 审计、CI 和工具脚本
- [x] website、配置和依赖变更
- [x] 相关 Nx lint/typecheck/test/build

## 验证记录

- `git diff --check main...HEAD`：通过。
- `git diff --check`：通过。
- `pnpm nx run aiao-vscode:lint`：通过。
- `pnpm nx run aiao-vscode:typecheck`：20 个任务全部通过，18 个缓存命中。
- `pnpm nx run aiao-vscode:test`：20 个任务全部通过，18 个缓存命中。
- `pnpm nx run aiao-vscode:test-browser`：21 个任务全部通过，19 个缓存命中。
- `pnpm nx run aiao-vscode-e2e:typecheck`、`pnpm nx run aiao-vscode-e2e:lint`：通过。
- `pnpm nx run aiao-vscode:verify-functions`：通过。
- `pnpm nx run aiao-vscode:verify-pages-routing`：通过，包含 16 项 Pages 路由验证；其依赖的构建通过。
- `NX_NO_CLOUD=true pnpm nx show projects --affected --base=main --head=HEAD --json`：通过；由于应用、工作区配置和锁文件变更，受影响图覆盖范围很大。
- `pnpm nx run aiao-vscode:verify-github-auth`：未完成，脚本需要预先运行 `http://localhost:4320/?workbench-verify`，当前连接被拒绝。
- `pnpm nx run aiao-vscode:verify-github-oauth`：未完成，脚本需要预先运行 `localhost:8788` OAuth mock/Pages 服务，当前连接被拒绝。两项是验收环境前置缺失，不作为代码失败结论。
- 多次任务报告 `rxdb-client-generator:build`、`rxdb-devtools:build`、`rxdb-plugin-working-tree:build` 为 Nx flaky task，但任务结果均成功；按仓库 `AGENTS.md` 的并发假失败规则记录为环境噪声，不归因于本分支代码。

全量 `pnpm test-all` 未在本次 30 分钟评审窗口内执行：affected 图接近整个工作区，且本次已完成应用核心单测、浏览器单测、类型检查、lint、构建依赖和部署验证。

## 范围 A：GitHub 远程仓库与项目打开流程

### 🔴 P1 — GitHub API 的 ETag 缓存未按身份隔离

- 文件：[github-api.ts](/Users/jimmy/Documents/aiao/worktree-rxdb-vscode/apps/aiao-vscode/src/workbench/git/github/github-api.ts:107)、[github-api.ts](/Users/jimmy/Documents/aiao/worktree-rxdb-vscode/apps/aiao-vscode/src/workbench/git/github/github-api.ts:155)、[github-api.ts](/Users/jimmy/Documents/aiao/worktree-rxdb-vscode/apps/aiao-vscode/src/workbench/git/github/github-api.ts:195)、[github-auth.ts](/Users/jimmy/Documents/aiao/worktree-rxdb-vscode/apps/aiao-vscode/src/workbench/git/github/github-auth.ts:82)
- 问题：`createGitHubApi()` 只用 URL 作为缓存键，认证请求、匿名请求以及不同 token 复用同一个 `{ etag, json }`。换 token 后仍会发送旧 token 对应的 `If-None-Match`；GitHub 返回 304 时直接返回旧 JSON。`createGitHubAuth()` 的登录、OAuth 完成、刷新和 logout 路径没有清空该缓存。
- 触发条件：同一页面先以账号 A 读取 `/user`、私有仓库 tree 或文件内容，再切换到账号 B；或者先匿名读取公开资源，再以认证身份读取相同 URL。
- 影响：账号 B 可能看到账号 A 的用户信息或私有仓库缓存内容；至少会得到错误的远端目录/文件状态。这是认证边界和数据隔离问题。
- 建议：缓存键至少包含认证身份指纹和 URL，并避免匿名/认证响应互相复用；或者在 token 变化、登录、OAuth 完成、refresh、logout 时调用 `clearCache()`。补充测试，断言 token 变化后收到 304 时不会返回前一个 token 的 JSON。

### 🔴 P1 — GitHub 虚拟后端的 rename/move 会静默覆盖目标并接受非法路径

- 文件：[github-backend.ts](/Users/jimmy/Documents/aiao/worktree-rxdb-vscode/apps/aiao-vscode/src/workbench/git/github/github-backend.ts:319)、[github-backend.ts](/Users/jimmy/Documents/aiao/worktree-rxdb-vscode/apps/aiao-vscode/src/workbench/git/github/github-backend.ts:329)
- 对照实现：[git-runtime.ts](/Users/jimmy/Documents/aiao/worktree-rxdb-vscode/apps/aiao-vscode/src/workbench/git/git-runtime.ts:203)
- 问题：远程 `rename()` 和 `move()` 没有调用 `assertGitPath()`，也没有检查目标是否已经存在；`rename()` 直接 `buffer.set(to, ...)`，`move()` 对目录移动没有防止目标位于源目录内部。`move()` 还会在确认子项后先递增 mutation，行为与本地后端不一致。
- 触发条件：在 GitHub 远程项目中把文件重命名到已有文件路径、把目录移动到自身子目录，或使用 `../`、空路径等非法 Git 路径。
- 影响：用户的目标文件本地编辑内容可能被静默覆盖；非法路径会进入远程缓冲区，直到提交或后续刷新才暴露错误；本地和远程项目对同一 UI 操作的结果不一致。
- 建议：复用本地后端的路径校验和冲突校验；目标已存在时返回 `path_collision`，拒绝目标位于源目录内部，并为远程 rename/move 增加冲突、非法路径和目录边界测试。

### 🟡 P2 — 打开 GitHub 远程项目会无条件触发必然失败的本地预览编译

- 文件：[catalog.ts](/Users/jimmy/Documents/aiao/worktree-rxdb-vscode/apps/aiao-vscode/src/workbench/catalog.ts:35)、[mount.ts](/Users/jimmy/Documents/aiao/worktree-rxdb-vscode/apps/aiao-vscode/src/workbench/mount.ts:572)、[mount.ts](/Users/jimmy/Documents/aiao/worktree-rxdb-vscode/apps/aiao-vscode/src/workbench/mount.ts:1069)、[compiler-project.ts](/Users/jimmy/Documents/aiao/worktree-rxdb-vscode/apps/aiao-vscode/src/workbench/compiler/compiler-project.ts:49)
- 问题：`githubProjectInfo()` 明确把远程项目设为 `template: 'vanilla'`、`entry: ''`，并注明远程仓库不承诺预览；但 `openProject()` 仍无条件调用 `savePreview.runSaved()`。编译器在 `compileProject()` 中执行 `projectPath(input.entry)`，空入口会直接抛出“不支持的项目路径”。
- 触发条件：打开任意 GitHub 远程仓库，或恢复一个远程项目。
- 影响：每次打开远程项目都会触发一次无意义的编译错误，污染输出/问题面板并浪费编译资源；若错误状态影响保存预览 UI，还会造成误导。
- 建议：远程项目跳过 `savePreview.runSaved()`，或先推断并验证明确入口后再编译；增加打开远程项目不产生编译错误的回归测试。

### 🔴 P1 — GitHub Contents API 对 1 MiB 以上文件会被当成空文件

- 文件：[github-api.ts](/Users/jimmy/Documents/aiao/worktree-rxdb-vscode/apps/aiao-vscode/src/workbench/git/github/github-api.ts:68)、[github-api.ts](/Users/jimmy/Documents/aiao/worktree-rxdb-vscode/apps/aiao-vscode/src/workbench/git/github/github-api.ts:326)、[github-backend.ts](/Users/jimmy/Documents/aiao/worktree-rxdb-vscode/apps/aiao-vscode/src/workbench/git/github/github-backend.ts:201)
- 问题：文件内容通过 GitHub Contents API 读取，而 `toBytes()` 对 `encoding: 'none'` 直接返回空字节。该 API 对超过 1 MiB 的文件不会返回 base64 内容；当前工作台单文件上限是 2 MiB，因此 1–2 MiB 的合法文件会被读成空文件。
- 触发条件：打开、拉取或恢复包含大于 1 MiB 且不超过工作台 2 MiB 上限的 GitHub 文件。
- 影响：用户看到的远程文件内容被静默替换为空；若随后保存或提交，会把原文件覆盖为空内容，造成数据丢失。
- 建议：使用 tree entry 的 blob SHA 调用 Git Database blob API，或使用受大小限制的 raw 下载；遇到 `encoding: 'none'` 必须报错/走备用读取路径，不能返回空字节。增加 1–2 MiB 文件的读取和提交回归测试。

### 🔴 P1 — GitHub 远程仓库读取没有执行文件数和总字节数上限

- 文件：[git-protocol.ts](/Users/jimmy/Documents/aiao/worktree-rxdb-vscode/apps/aiao-vscode/src/workbench/git/git-protocol.ts:81)、[github-backend.ts](/Users/jimmy/Documents/aiao/worktree-rxdb-vscode/apps/aiao-vscode/src/workbench/git/github/github-backend.ts:189)、[github-backend.ts](/Users/jimmy/Documents/aiao/worktree-rxdb-vscode/apps/aiao-vscode/src/workbench/git/github/github-backend.ts:212)、[github-backend.ts](/Users/jimmy/Documents/aiao/worktree-rxdb-vscode/apps/aiao-vscode/src/workbench/git/github/github-backend.ts:516)、[github-api.ts](/Users/jimmy/Documents/aiao/worktree-rxdb-vscode/apps/aiao-vscode/src/workbench/git/github/github-api.ts:429)
- 问题：工作台定义了 2,000 个文件、20 MiB 总内容和 24 MiB 归档上限，但远程 `fetchContents()` 只检查单文件大小；`readRemote()`、`restore()` 和 `exportArchive()` 没有执行总文件数、总字节或归档字节校验。
- 触发条件：打开、拉取、恢复或导出包含大量文件或大总量内容的 GitHub 仓库。
- 影响：远程仓库可通过公开输入触发大量并发 API 请求、内存占用和 zip 缓冲，造成浏览器卡顿、内存耗尽或 GitHub API 配额快速消耗；行为也违反本地后端已执行的资源约束。
- 建议：在拉取内容前检查条目数量，下载过程中累加并在超过总量时中止；对 zipball 使用响应体大小上限/流式读取；让远程 open、pull、restore、export 与本地后端共用同一组限制测试。

### 🟡 P2 — 非截断 GitHub tree 被重复遍历，正常仓库会重复请求目录和文件

- 文件：[github-api.ts](/Users/jimmy/Documents/aiao/worktree-rxdb-vscode/apps/aiao-vscode/src/workbench/git/github/github-api.ts:293)、[github-api.ts](/Users/jimmy/Documents/aiao/worktree-rxdb-vscode/apps/aiao-vscode/src/workbench/git/github/github-api.ts:300)、[github-api.ts](/Users/jimmy/Documents/aiao/worktree-rxdb-vscode/apps/aiao-vscode/src/workbench/git/github/github-api.ts:308)
- 问题：请求已经带 `?recursive=1`，正常情况下 `rawTree` 已包含所有后代条目；代码仍把所有 tree 条目放入 `subtrees` 并逐个重新请求，再把 blob 加入结果。因此非 `truncated` 的仓库会重复返回文件条目，后端随后按重复条目重复调用文件内容 API。
- 触发条件：打开或拉取普通的、未被 GitHub tree API 截断的多目录仓库。
- 影响：每个目录增加一次 GitHub API 请求，每个文件可能重复下载；大仓库会明显变慢并加速触发 rate limit，且测试只覆盖了 `truncated: true` 分支，未覆盖正常递归响应。
- 建议：仅在响应明确 `truncated === true` 时递归请求子树；正常响应直接使用递归结果，并按 path/SHA 去重。补充非截断递归响应的请求次数测试。

### 🟡 P2 — 含特殊字符的合法分支名无法通过 GitHub 提交

- 文件：[github-api.ts](/Users/jimmy/Documents/aiao/worktree-rxdb-vscode/apps/aiao-vscode/src/workbench/git/github/github-api.ts:415)、[github-backend.ts](/Users/jimmy/Documents/aiao/worktree-rxdb-vscode/apps/aiao-vscode/src/workbench/git/github/github-backend.ts:469)
- 问题：读取分支时使用 `encodeURIComponent(branch)`，但更新 ref 时直接拼接未编码的 `ref`。分支名包含 `#` 等 URL 特殊字符时，浏览器会把字符解释为 fragment 或改变路径，提交请求到错误的 ref。
- 触发条件：在名称包含 URL 特殊字符的合法 Git 分支上修改并提交。
- 影响：提交失败，或请求的目标 ref 与用户选择的分支不一致；读取与提交对同一分支的编码规则不对称。
- 建议：按路径段编码 `heads` 和分支名，至少对分支部分使用与 `getBranchSha()` 一致的编码策略，并补充 `feature#hash` 等分支名测试。

## 范围 B：`packages/**` 运行时代码评审

- 评审时间：2026-11-11（Asia/Shanghai）
- 评审分支：`aiao-vscode`
- 对比基线：`main...HEAD`
- `main`：`4eb5ab5e64a49457aa3a7901b15cb15b0d163478`
- `HEAD`：`610b1b5be900a5e9a7f154e71fc3bc60b56aa280`
- 评审范围：`packages/rxdb`、SQLite/PGlite/HTTP/加密/WASM/wa-sqlite 适配器、`rxdb-plugin-*` 及其余 `packages/**` 运行时代码；排除测试、文档和评审记录。

### 结论

**🟢 未发现问题。** `main...HEAD` 没有任何 `packages/**` 路径差异，因此不存在可归因于本分支的 packages 运行时代码变更；数据丢失、事务/并发、SQL 参数/路径、API 破坏、类型不安全和三框架不对称均无新增审查对象。没有需要报告的文件:行号、严重级别、触发条件、影响或修复建议。

### 差异边界证据

- `git diff --name-status main...HEAD -- packages/`：空。
- `git diff --numstat main...HEAD -- packages/`：空。
- `git log main..HEAD -- packages/`：空，没有当前分支提交触及 `packages/**`。
- `git diff --cached --name-status -- packages/`：空。
- `git diff --summary -M -C main...HEAD -- packages/`：空，未发现重命名、子模块或大小写路径边界异常。
- `main` 与 `HEAD` 的 `packages` tree ID 相同：`6953cc0852f696494c727af74f9b2589f003266d`。

### 并行复核

- 范围核验子智能体：独立执行差异、提交、重命名/复制检测、工作区状态和子模块检查，结论为 `packages/**` 无差异。
- 运行时风险子智能体：按数据一致性、事务并发、SQL、API、类型安全和跨框架对称性复核，结论为无差异、无发现。
- 验证规划子智能体：确认无 package 源码差异；主审查用 Nx affected 查询成功验证受影响范围。

## 范围 C：构建、部署、E2E、脚本和工作区配置

### 结论

**🟢 未发现新增问题。** 构建产物和 WASM 资产路径、Pages Functions、OAuth 回跳、响应头/重写规则、E2E target、静态服务器、锁文件和相关脚本均完成了独立复核；没有确认的 P0/P1/P2。

- `aiao-vscode:build`、Pages routing 16 项验证通过。
- `verify-functions` 11 项验证通过；`_headers`、`_redirects` 与 OAuth 函数的安全行为验证通过。
- `aiao-vscode-e2e` 的 lint/typecheck、测试发现和 `scripts/e2e-static-server.mjs` 相关测试通过。
- `pnpm-lock.yaml` 的 frozen/offline 安装校验通过。

## 范围 D：Angular 宿主与工作台生命周期

### 🟡 P2 — Angular 组件销毁后，延迟挂载仍可能继续创建工作台

- 文件：[app.component.ts](/Users/jimmy/Documents/aiao/worktree-rxdb-vscode/apps/aiao-vscode/src/app/app.component.ts:90)、[app.component.ts](/Users/jimmy/Documents/aiao/worktree-rxdb-vscode/apps/aiao-vscode/src/app/app.component.ts:93)、[app.component.ts](/Users/jimmy/Documents/aiao/worktree-rxdb-vscode/apps/aiao-vscode/src/app/app.component.ts:227)、[app.component.ts](/Users/jimmy/Documents/aiao/worktree-rxdb-vscode/apps/aiao-vscode/src/app/app.component.ts:256)
- 问题：`ngAfterViewInit()` 启动未被取消的 `mountWhenReady()`；它会等待 RxDB 连接或超时。`ngOnDestroy()` 只释放当时已经存在的 `workbench`，等待结束后仍会无条件执行 `mountWorkbench()`。
- 触发条件：组件在数据库连接等待期间被销毁，例如路由切换、测试重建组件或应用容器卸载。
- 影响：已销毁的宿主元素仍可能挂载完整工作台，留下编辑器、预览、监听器和后台服务；因为新句柄没有机会被 Angular 的 `ngOnDestroy()` 再次释放，形成资源泄漏和孤立 UI。
- 建议：增加销毁标记或 `AbortSignal`，在异步等待结束和调用 `mountWorkbench()` 前检查；若竞态下已经创建，则立即释放新句柄。补充“销毁发生在连接等待期间”的回归测试。

### 🟡 P2 — GitHub 认证订阅未随工作台 dispose 释放

- 文件：[mount.ts](/Users/jimmy/Documents/aiao/worktree-rxdb-vscode/apps/aiao-vscode/src/workbench/mount.ts:381)、[mount.ts](/Users/jimmy/Documents/aiao/worktree-rxdb-vscode/apps/aiao-vscode/src/workbench/mount.ts:2742)
- 问题：工作台创建时调用 `options.githubAuth.subscribe(...)`，但丢弃了返回的取消函数；`dispose()` 只释放工作台内部资源，没有退订该 listener。
- 触发条件：同一页面重复挂载/卸载工作台，且传入 `githubAuth`；随后登录、登出或刷新认证状态。
- 影响：旧工作台闭包会继续被认证服务持有，认证状态变化仍会触发已销毁实例的监听器。重复挂载后监听器数量持续增加，也可能保留 DOM、项目状态和相关闭包，造成内存泄漏和无效更新。
- 建议：保存 `subscribe()` 返回的释放函数，在 `dispose()` 中幂等调用一次，并为重复 mount/dispose 后认证状态变化增加测试。

## 范围 E：预览沙箱、跨源 runtime host、terminal 和文件监听

### 结论

**🟢 未发现新增问题。** 独立检查了跨源 `postMessage` 的 source/origin/session 校验、预览 iframe 的 CSP 与 sandbox、runtime host 路径限制、MessagePort/iframe/Service Worker 生命周期、Vivari/Nodepod 适配、终端文件监听和对应测试；没有确认的 P0/P1/P2。

## 范围 F：PWA window-controls-overlay 提交

### 结论

**🟢 未发现新增问题。** `display_override`、显示模式识别、工作台根节点标记、窗口控制区 CSS 和对应 Vitest 用例已检查；当前实现按 window-controls-overlay、standalone、browser 顺序回退，未发现确认的 P0/P1/P2。

## 评审结论

当前分支不建议直接合并。至少应先处理 4 个 P1：认证缓存隔离、远程 rename/move 校验、1–2 MiB GitHub 文件读取、远程仓库资源上限；P2 问题应在同一改动中补上对应回归测试。评审记录已保存在本文件，未修改业务代码。
