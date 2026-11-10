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
 * 本地 commit 钩子（`commit-msg` / `pre-push`）要校验的分支名列表，按分支名**精确匹配**，不支持通配符。
 *
 * 当前为空：本地钩子不校验任何分支。落进 main 的文案由 CI 校验 PR 标题（`commit-lint.mjs --message`），
 * PR 一律 squash，特性分支上的中间提交不进主线。
 *
 * 历史：这里曾写成 `['*']` 并声称「全部分支」，但 `shouldCheckCurrentBranch` 只做 `includes`，
 * 没有哪个分支叫 `*`，两个钩子在所有分支上都是空操作（RV-01a1bb68e74e）。要启用某个分支的本地校验，
 * 把它的名字写进来；要对全部分支生效，得先放宽 commitizen 的 type / scope 白名单，并让自动提交改用
 * `wip: ...` 前缀（`ALLOWED_PREFIXES` 放行），否则占位提交会被挡下。
 */
export const NEED_CHECK_COMMIT_BRANCH_NAMES = [];
