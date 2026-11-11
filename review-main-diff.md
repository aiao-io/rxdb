# 当前分支相对 `main` 的代码评审记录

- 评审分支：`aiao-vscode`
- 对比基线：`main...HEAD`
- merge-base：`db95eefdbb5c707c9329955e53d0f9ab5e65e1f7`
- HEAD：`ad528311036cf5a76d448e08456c1d8dd8acbc3e`
- 当前时间：2026-11-11（Asia/Shanghai）
- 初始范围：985 个文件，约 95,466 行新增、2,363 行删除；其中约 734 个可执行代码/配置/测试文件。

## 评审方法

1. 先按目录和文件类型筛出运行时代码、构建/部署配置、测试和脚本。
2. 结合调用方与测试检查数据流、错误处理、权限/跨源边界、资源生命周期和回归风险。
3. 对高风险点记录文件、行号、触发条件、实际影响和修复建议。
4. 最后运行与改动相关的 Nx 校验；若全量校验超出时间，记录具体未覆盖项。

## 发现

（评审进行中。）

## 已检查范围

- [x] 分支状态、merge-base、提交数量和差异规模
- [ ] `apps/aiao-vscode` 运行时代码
- [ ] `apps/aiao-vscode-e2e` 与工作台验收测试
- [ ] 部署函数和构建脚本
- [ ] `packages/*` 受影响公共包
- [ ] `scripts/*` 审计、CI 和工具脚本
- [ ] website、配置和依赖变更
- [ ] 相关 Nx lint/typecheck/test/build

## 验证记录

（评审进行中。）

## 范围 B：`packages/**` 运行时代码评审

- 评审时间：2026-11-11（Asia/Shanghai）
- 评审分支：`aiao-vscode`
- 对比基线：`main...HEAD`
- `main`：`4eb5ab5e64a49457aa3a7901b15cb15b0d163478`
- `HEAD`：`ad528311036cf5a76d448e08456c1d8dd8acbc3e`
- 评审范围：`packages/rxdb`、SQLite/PGlite/HTTP/加密/WASM/wa-sqlite 适配器、`rxdb-plugin-*` 及其余 `packages/**` 运行时代码；排除测试、文档和生成评审文件。

### 结论

**🟢 未发现问题。** `main...HEAD` 没有任何 `packages/**` 路径差异，因此不存在可归因于本分支的 packages 运行时代码变更；数据丢失、事务/并发、SQL 参数/路径、API 破坏、类型不安全和三框架不对称均无新增审查对象。没有需要报告的文件:行号、严重级别、触发条件、影响或修复建议。

### 差异边界证据

- `git diff --name-status main...HEAD -- packages/`：空。
- `git diff --numstat main...HEAD -- packages/`：空。
- `git log main..HEAD -- packages/`：空，没有当前分支提交触及 `packages/**`。
- `git diff --cached --name-status -- packages/`：空。
- `git status --short --untracked-files=all -- packages/`：空；唯一未跟踪文件是本评审记录 `review-main-diff.md`，不在 `packages/**`。
- `git diff --summary -M -C main...HEAD -- packages/`：空，未发现重命名、子模块或大小写路径边界异常。

### Nx 验证

- `NX_NO_CLOUD=true pnpm nx show projects --affected --base=main --head=HEAD --json`：命令成功。
- Nx 输出包含多个 package 项目，原因是当前分支存在应用/工作区级变更导致依赖图计算出受影响项目；这不改变 Git 对 `packages/**` 的直接差异为空这一事实，也没有可针对本范围运行的 package 变更测试目标。
- 未运行 package lint/typecheck/test/build：范围内没有变更代码，运行结果不能增加对本范围的验证价值。

### 并行复核

- 范围核验子智能体：独立执行 `git diff --name-status`、`git log`、重命名/复制检测、工作区状态和子模块检查，结论为 `packages/**` 无差异。
- 运行时风险子智能体：按数据一致性、事务并发、SQL、API、类型安全和跨框架对称性复核，结论为无差异、无发现。
- 验证规划子智能体：确认无 package 源码差异；其只读环境的 Nx project graph 被 `.nx/workspace-data` 权限拒绝，主审查随后用 `NX_NO_CLOUD=true pnpm nx show projects --affected --base=main --head=HEAD --json` 成功验证。未跟踪评审文件不影响代码范围。

## 范围 A：GitHub 远程仓库与项目打开流程

### 🔴 P1 — GitHub API 的 ETag 缓存未按身份隔离

- 文件: [github-api.ts](/Users/jimmy/Documents/aiao/worktree-rxdb-vscode/apps/aiao-vscode/src/workbench/git/github/github-api.ts:107), [github-api.ts](/Users/jimmy/Documents/aiao/worktree-rxdb-vscode/apps/aiao-vscode/src/workbench/git/github/github-api.ts:155), [github-api.ts](/Users/jimmy/Documents/aiao/worktree-rxdb-vscode/apps/aiao-vscode/src/workbench/git/github/github-api.ts:195), [github-auth.ts](/Users/jimmy/Documents/aiao/worktree-rxdb-vscode/apps/aiao-vscode/src/workbench/git/github/github-auth.ts:82)
- 问题：`createGitHubApi()` 只用 URL 作为缓存键，认证请求、匿名请求以及不同 token 复用同一个 `{ etag, json }`。换 token 后仍会发送旧 token 对应的 `If-None-Match`；GitHub 返回 304 时直接返回旧 JSON。`createGitHubAuth()` 的登录、OAuth 完成、刷新和 logout 路径没有清空该缓存。
- 触发条件：同一页面先以账号 A 读取 `/user`、私有仓库 tree 或文件内容，再切换到账号 B；或者先匿名读取公开资源，再以认证身份读取相同 URL。
- 影响：账号 B 可能看到账号 A 的用户信息或私有仓库缓存内容；至少会得到错误的远端目录/文件状态。这是认证边界和数据隔离问题。
- 建议：缓存键至少包含认证身份指纹和 URL，并避免匿名/认证响应互相复用；或者在 token 变化、登录、OAuth 完成、refresh、logout 时调用 `clearCache()`。补充测试，断言 token 变化后收到 304 时不会返回前一个 token 的 JSON。

### 🟡 P1 — GitHub 虚拟后端的 rename/move 会静默覆盖目标并接受非法路径

- 文件: [github-backend.ts](/Users/jimmy/Documents/aiao/worktree-rxdb-vscode/apps/aiao-vscode/src/workbench/git/github/github-backend.ts:319), [github-backend.ts](/Users/jimmy/Documents/aiao/worktree-rxdb-vscode/apps/aiao-vscode/src/workbench/git/github/github-backend.ts:329)
- 对照实现: [git-runtime.ts](/Users/jimmy/Documents/aiao/worktree-rxdb-vscode/apps/aiao-vscode/src/workbench/git/git-runtime.ts:203)
- 问题：远程 `rename()` 和 `move()` 没有调用 `assertGitPath()`，也没有检查目标是否已经存在；`rename()` 直接 `buffer.set(to, ...)`，`move()` 对目录移动没有防止目标位于源目录内部。并且 `move()` 在发现子项后先递增 mutation，随后才可能继续处理，行为与本地后端不一致。
- 触发条件：在 GitHub 远程项目中把文件重命名到已有文件路径、把目录移动到自身子目录，或使用 `../`、空路径等非法 Git 路径。
- 影响：用户的目标文件本地编辑内容可能被静默覆盖；非法路径会进入远程缓冲区，直到提交或后续刷新才暴露错误；本地和远程项目对同一 UI 操作的结果不一致。
- 建议：复用本地后端的路径校验和冲突校验；目标已存在时返回 `path_collision`，拒绝目标位于源目录内部，并为远程 rename/move 增加冲突、非法路径和目录边界测试。

### 🟡 P2 — 打开 GitHub 远程项目会无条件触发必然失败的本地预览编译

- 文件: [catalog.ts](/Users/jimmy/Documents/aiao/worktree-rxdb-vscode/apps/aiao-vscode/src/workbench/catalog.ts:35), [mount.ts](/Users/jimmy/Documents/aiao/worktree-rxdb-vscode/apps/aiao-vscode/src/workbench/mount.ts:572), [mount.ts](/Users/jimmy/Documents/aiao/worktree-rxdb-vscode/apps/aiao-vscode/src/workbench/mount.ts:1069), [compiler-project.ts](/Users/jimmy/Documents/aiao/worktree-rxdb-vscode/apps/aiao-vscode/src/workbench/compiler/compiler-project.ts:49)
- 问题：`githubProjectInfo()` 明确把远程项目设为 `template: 'vanilla'`、`entry: ''`，并注明远程仓库不承诺预览；但 `openProject()` 仍无条件调用 `savePreview.runSaved()`。编译器在 `compileProject()` 中执行 `projectPath(input.entry)`，空入口会直接抛出“不支持的项目路径”。
- 触发条件：打开任意 GitHub 远程仓库，或恢复一个远程项目。
- 影响：每次打开远程项目都会触发一次无意义的编译错误，污染输出/问题面板并浪费编译资源；若错误状态影响保存预览 UI，还会造成误导。
- 建议：远程项目跳过 `savePreview.runSaved()`，或先推断并验证明确入口后再编译；增加打开远程项目不产生编译错误的回归测试。
