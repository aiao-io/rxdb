---
id: ADESK-US-209
title: GitHub 应用与 OPFS Git 工作区
status: Backlog
priority: High
epic: ADESK-EPIC-004
created: 2026-11-20
updated: 2026-11-20
tags: [application, github, git, opfs, oauth, github-desktop]
dependsOn: [ADESK-US-201, ADESK-US-205, ADESK-US-206]
capabilities: []
---

# 用户故事：GitHub 应用与 OPFS Git 工作区

## 作为/我想要/以便

**作为** 在浏览器里管理代码仓库的 Aiao Desktop 用户
**我想要** 在桌面中打开一个 GitHub 应用，用熟悉的 GitHub Desktop 工作区管理本地仓库，并登录 GitHub 访问远端仓库
**以便** 代码文件和 Git 历史在刷新、关闭和重新打开后仍能继续使用，同时可以把本地提交交接给 GitHub。

## 范围边界

本故事分三个交付阶段，全部属于当前承诺。阶段之间按 A → B → C 推进，阶段内可以并行实现。

### In Scope

- **应用入口与视觉**：GitHub 作为 Aiao Desktop 预装内置应用登记，能够从 Applications、启动台和聚焦搜索打开，使用独立窗口和统一应用生命周期。工作区的布局、密度、颜色、选中行、分支工具栏、Changes / History 标签页、文件列表、提交框、差异面板、历史详情、可拖动分栏和键盘等效操作，以 `dev-rxdb-angular` 中现有 GitHub Desktop 形态为视觉参考。
- **本地 OPFS Git**：每个仓库拥有独立的 OPFS 根，工作区文件、`.git`、objects、refs、HEAD、index 和仓库状态都由 Git 文件系统层管理。RxDB 只保存仓库目录、远端坐标、当前分支和界面所需索引等元数据，不与桌面虚拟磁盘共享同一路径。
- **本地工作流**：新建、导入、打开和导出仓库；读取状态；查看工作区和暂存区差异；暂存、取消暂存、丢弃单文件改动；创建和切换分支；在有未提交改动时明确处理切换冲突；提交、查看历史和恢复可达提交。文本和二进制文件保留原始字节，路径冲突、超限和不支持的文件语义明确失败。
- **持久化与并发**：Git 操作在独立 Worker 中执行，并用仓库级 Web Locks 串行化同仓库写入。刷新、关闭后重新打开、Worker 中断、配额不足、OPFS 写入失败或重复提交不能伪报成功，也不能覆盖最后一个可恢复版本。
- **GitHub 认证**：支持 GitHub OAuth PKCE 登录和显式标注的 PAT 回退路径。OAuth 授权码交换经过受控的同源服务或桌面授权桥接，校验 state、nonce 和 code verifier；OAuth 与 PAT 都使用与应用来源匹配的受保护存储。界面支持登录、查看当前账户、退出、登录过期和其他标签页完成登录后的刷新。
- **GitHub 远端**：登录后支持通过 owner/repo、仓库搜索和分支选择打开公开或当前账户有权访问的私有仓库，把选定分支的工作区和必要 Git 元数据写入 OPFS。拉取、提交并推送使用 GitHub API 的 blob / tree / commit / ref 能力，远端分支已变化时保留本地改动并显示冲突，不覆盖用户工作区。
- **验收入口**：提供本地单测、正式构建上的 Chromium 冒烟和持久浏览器上下文复验，覆盖应用入口、键盘路径、OPFS 恢复、Git 状态闭环、OAuth 失败路径、公开与私有仓库边界、远端冲突和无网络状态。

### Out of Scope

- GitHub Issues、Pull Requests、Projects、Actions、Releases、组织管理、代码审查和通知中心。
- 其他 Git 服务、任意远端 URL、Git Smart HTTP 直连、公共代理以及把私库凭据交给公共代理。
- 把 Git 工作区挂到 Finder 虚拟磁盘，或与桌面虚拟磁盘自动双向同步。用户主动导入、导出和复制的边界另行设计。
- 终端、`pnpm install`、原生模块、任意 Nx 构建、SSR 和不受控代码预览。
- 跨设备同步、跨浏览器恢复、自动远程备份、Git LFS、submodule、worktree、sparse checkout、tag 管理和完整 Git 客户端兼容性。
- 以 OPFS 存储替代用户备份。清除站点数据、浏览器存储配额和安全上下文仍属于浏览器边界，产品需要在界面上说明。

## 交付阶段

| 阶段 | 用户可见价值 | 依赖 | 关闭条件 | 状态 |
| ---- | ------------ | ---- | -------- | ---- |
| A | 用户能从 Aiao Desktop 打开 GitHub 应用，并在 GitHub Desktop 形态的工作区里查看仓库、分支、变更和历史 | ADESK-US-201、ADESK-US-205、ADESK-US-206 | 应用清单、窗口生命周期、视觉布局、主题、键盘等效操作和失败空态在正式构建中可用 | ⬜ |
| B | 用户能在浏览器本地建立可恢复的 Git 工作区，完成编辑、分支、暂存、差异、提交和历史操作 | 阶段 A；`apps/aiao-vscode/src/workbench/git/` 的 Git Worker 与 `WorkbenchBackend` 契约 | 工作区和 `.git` 均在 OPFS；刷新、重开、并发写入、失败恢复和导出重导入通过同一组仓库 fixture | ⬜ |
| C | 用户能登录 GitHub，打开远端仓库，在本地 OPFS 工作区拉取和推送，并处理认证失败、网络失败和远端冲突 | 阶段 B；现有 GitHub OAuth 桥接与 GitHub API 适配 | OAuth 状态校验、会话清除、公开/私有仓库、分支快照、API 提交、拉取冲突和推送冲突在受控网络环境通过 | ⬜ |

## 验收标准

| #   | 前置条件 | 操作 | 预期结果 | 状态 |
| --- | -------- | ---- | -------- | ---- |
| 1 | Aiao Desktop 正式构建 | 从 Applications、启动台或聚焦搜索打开 GitHub | GitHub 应用作为预装内置应用出现，窗口可以打开、聚焦、最小化、还原和关闭，应用失败不影响其他桌面窗口 | ⬜ |
| 2 | GitHub 应用窗口已打开 | 查看空态、仓库工作区和仓库有变更的状态 | 页面具有 GitHub Desktop 形态的仓库工具栏、分支选择、Changes / History、文件列表、提交框、差异或历史详情，并能在亮色和暗色主题下保持可读 | ⬜ |
| 3 | GitHub 应用窗口已打开 | 只用键盘完成打开仓库、切换 Changes / History、选择文件、打开差异、提交和关闭对话框 | 每个动作都有可聚焦的控件、可理解的名称和等效按钮，焦点不会被异步刷新或失败提示吞掉 | ⬜ |
| 4 | 浏览器处于安全上下文且支持 OPFS、Web Locks 和 Git Worker | 创建或导入仓库并检查其持久内容 | 工作区文件和 `.git` 元数据写入 GitHub 应用的独立 OPFS 根，RxDB 只保留仓库元数据，Finder 虚拟磁盘中不会出现同一份隐式副本 | ⬜ |
| 5 | OPFS 中存在一个仓库 | 刷新页面、关闭窗口后重新打开应用，再查看分支、HEAD、工作区、暂存区和历史 | 所有状态与最后一次成功操作一致，文本、UTF-8、CRLF、点文件、嵌套路径和二进制字节保持不变 | ⬜ |
| 6 | 仓库包含新增、修改、删除和重命名文件 | 依次执行 status、选择差异、stage、unstage、discard、commit、history、restore、create branch 和 switch branch | 状态、暂存内容、差异、提交图和分支结果与 Git 语义一致，带未提交改动切换分支时先明确提示并按用户选择处理 | ⬜ |
| 7 | 同一仓库被两个标签页打开，或 Git Worker 在写入中途失败 | 并发执行写操作，或模拟 Worker 中断、配额不足和 OPFS 写失败后重新打开仓库 | 同一仓库写入按仓库级锁串行化，失败不会显示成功、不会丢失最后一个成功版本，残留状态可以被诊断和恢复 | ⬜ |
| 8 | 仓库存在提交历史 | 导出完整仓库后在新的仓库标识下导入并继续提交 | 导出包含工作区与 `.git`，导入后的 HEAD、分支、历史和文件字节可被 Git 工作区继续使用，坏包或超限包不会创建半成品仓库 | ⬜ |
| 9 | 用户点击 GitHub 登录 | 取消 OAuth 授权、关闭授权窗口、伪造 state、重复使用 code、让授权码交换失败，或输入空/无效 PAT | 不创建会话，不把 token 写入 URL 或普通 localStorage，界面给出可恢复错误，下一次登录可以重新开始 | ⬜ |
| 10 | 用户完成 GitHub OAuth 登录 | 刷新应用、在另一个标签页完成登录、退出登录或使用失效 token 访问私有仓库 | 当前账户、头像和登录来源显示正确，退出后本地会话与缓存清除，失效会话要求重新登录，其他标签页能刷新到最新状态 | ⬜ |
| 11 | 用户已登录，或正在打开公开仓库 | 搜索仓库或输入 owner/repo，选择分支并打开 | 选定分支的远端文件、必要 Git 元数据、远端坐标和当前提交写入独立 OPFS 工作区，公开仓库不因未登录被错误拦截，私有仓库权限不足给出明确提示 | ⬜ |
| 12 | 本地 OPFS 工作区已有改动，远端也可能已更新 | 执行拉取、提交并推送 | 非冲突远端改动可以保留本地改动并继续工作；远端分支前进或 API 冲突时拒绝覆盖本地内容，保留本地提交和暂存状态，并提供下一步处理入口 | ⬜ |
| 13 | 真实浏览器正式构建，外网请求按测试夹具受控 | 运行 GitHub 应用的单测、类型检查、构建、Chromium 冒烟和持久浏览器上下文复验 | 应用入口、视觉交互、OPFS Git 闭环、OAuth 边界、远端错误和恢复路径都有同层证据，未验证能力不标记为已完成 | ⬜ |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

验收证据：实现阶段补充对应单测、正式构建冒烟报告、持久浏览器上下文记录和同目录 `US-209-evidence.md`；当前没有实现证据，所有 AC 保持未开始。

## 技术笔记

- 视觉参考使用 [`working-tree.page.ts`](../../../../apps/dev-rxdb-angular/src/app/pages/working-tree/working-tree.page.ts)、其拆分组件和 [`styles.scss`](../../../../apps/dev-rxdb-angular/src/styles.scss) 中的 `.gd-*` 规则。复制视觉语言和交互信息架构，不复制 RxDB working-tree 的业务模型。
- Git 核心优先复用 [`session.ts`](../../../../apps/aiao-vscode/src/workbench/session.ts) 的 `WorkbenchBackend` 契约、[`git-worker.ts`](../../../../apps/aiao-vscode/src/workbench/git/git-worker.ts) 的 Worker 调度、[`git-runtime.ts`](../../../../apps/aiao-vscode/src/workbench/git/git-runtime.ts) 的 OPFS 持久化与仓库锁，以及 [`git-archive.ts`](../../../../apps/aiao-vscode/src/workbench/git/git-archive.ts) 的导入导出约束。
- GitHub 连接参考 [`github-api.ts`](../../../../apps/aiao-vscode/src/workbench/git/github/github-api.ts)、[`github-auth.ts`](../../../../apps/aiao-vscode/src/workbench/git/github/github-auth.ts)、[`github-backend.ts`](../../../../apps/aiao-vscode/src/workbench/git/github/github-backend.ts)、[`github-login.ts`](../../../../apps/aiao-vscode/src/workbench/git/github/github-login.ts) 和 [`github-session-store.ts`](../../../../apps/aiao-vscode/src/workbench/git/github/github-session-store.ts)。远端操作通过 GitHub API 完成，不把 Git Smart HTTP 当作浏览器直连能力。
- 现有 [`github-oauth.ts`](../../../../aiao-desktop/apps/web/src/app/services/github-oauth.ts) 只允许预装的 Aiao Code 发起授权。GitHub 应用接入时要扩展应用来源校验和授权桥接，并保持 state、nonce、code verifier、用户手势、前台窗口和取消语义。
- 仓库目录、工作区文件和 Git 对象的存储边界必须与 Aiao Desktop 的虚拟磁盘保持独立。OPFS 根清除、配额失败和安全上下文缺失必须成为可见的错误状态，不能静默回退到内存或 RxDB 文件体。
- 首版不承诺完整 Git 客户端兼容性。实现前先用同一份小仓库 fixture 固定 `init → edit → status → stage → commit → log → branch / checkout` 与刷新重开，再接入 GitHub API 的打开、拉取和推送。

## 实现文件

| 阶段 | 文件 | 改动 |
| ---- | ---- | ---- |
| A | `aiao-desktop/apps/web/src/app/apps/app-manifests.ts`、`aiao-desktop/apps/web/src/app/apps/registry.ts` | GitHub 内置应用登记、懒加载和窗口元数据 |
| A | `aiao-desktop/apps/web/src/app/apps/github/`（新增） | GitHub Desktop 形态的工作区页面、组件和局部样式 |
| B | `apps/aiao-vscode/src/workbench/git/` 与 `aiao-desktop/apps/web/src/app/apps/github/` | 抽取或适配框架无关 Git Worker、OPFS 仓库和 GitHub 应用状态模型 |
| B | `aiao-desktop/apps/web/src/app/services/github-repository.ts`（新增） | 仓库目录、OPFS 根、恢复、导入导出和并发协调 |
| C | `aiao-desktop/apps/web/src/app/services/github-oauth.ts`、`aiao-desktop/apps/web/public/github-oauth-return.*` | GitHub 应用登录桥接、回调和会话清理 |
| C | `aiao-desktop/apps/web/src/app/services/github-repository.ts`、`aiao-desktop/apps/web/src/app/services/github-api.ts`（新增） | GitHub API、远端坐标、拉取、提交并推送与冲突错误 |
| A～C | `aiao-desktop/apps/e2e/src/groups/github-app.mjs`（新增）及 `smoke.mjs` | 正式构建冒烟、持久化、键盘、认证和远端错误验收 |

## References

- [GitHub Desktop 形态参考：dev-rxdb-angular working-tree](../../../../apps/dev-rxdb-angular/src/app/pages/working-tree/working-tree.page.ts)
- [Git Worker 与 OPFS 参考：aiao-vscode](../../../../apps/aiao-vscode/src/workbench/git/git-runtime.ts)
- [GitHub API 与登录参考：aiao-vscode](../../../../apps/aiao-vscode/src/workbench/git/github/github-service.ts)
- [浏览器代码工作区：Git + OPFS](../../../../requirements/domain-research/browser-git-opfs.md)
- [vscode.dev 的 GitHub 连接、克隆与推送机制](../../../../requirements/domain-research/vscode-dev-github-integration.md)
- [ADESK-US-206 应用懒加载与统一系统能力](ADESK-US-206-lazy-app-runtime-and-host-capabilities.md)
