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
 * 需要执行 commit 校验的分支名列表。
 * commit-lint.mjs 只在这些分支上校验 commit message 文案，其余分支直接放行。
 */
export const NEED_CHECK_COMMIT_BRANCH_NAMES = ['main'];
