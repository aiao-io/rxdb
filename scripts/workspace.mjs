/**
 * scripts/workspace.mjs
 *
 * 跨脚本共享的仓库常量。被其他 .mjs 通过 `import { ... } from './workspace.mjs'` 复用。
 * 集中在一处，避免散落的 magic string。
 */

/** npm scope：所有公开包都以 `@aiao/...` 命名。 */
export const NPM_SCOPE = 'aiao';

/**
 * 需要在 install 后预构建的库列表。
 * check-workspace.mjs 会在 postinstall 钩子里跑 `nx run-many --target=build --projects=...`，
 * 保证这些库的 dist/ 已经就绪，下游包 import 不会因为找不到产物而报错。
 */
export const NEED_BUILDS = ['rxdb-test'];

/**
 * 需要执行 commit 校验的分支名列表；`'*'` 表示全部分支。
 *
 * 曾经只校验 `main`：理由是 PR 一律 squash，特性分支上的中间提交不进主线。代价是特性分支上
 * 58% 的提交信息是 `123` 这类占位，`git bisect` / `git blame` 在分支上完全不可用。现在改为全部分支：
 * 真的只是存档用 `wip: ...` 前缀（`ALLOWED_PREFIXES` 放行），不要写 `123`。
 */
export const NEED_CHECK_COMMIT_BRANCH_NAMES = ['*'];
