/**
 * @fileoverview 本插件的身份：能力名与包说明符。
 *
 * @remarks
 * 单独一个**叶子模块**，不放进 `plugin.ts`，理由是依赖方向：`plugin.ts` 要 import
 * `commit/commit-capability.ts`（读能力位），而后者报版本不匹配时也要报出能力名——
 * 定义留在 `plugin.ts` 就成了环。叶子谁都能引，且它不 import 任何东西。
 */

/**
 * 本能力的名字：插件名、水位行归因、版本不匹配报错，三处用的同一个字符串。
 *
 * @remarks
 * 一处定义、三处引用（`RxDBPluginWorkingTree.name`、`RxDBSystemContribution.capability`、
 * `commit-capability.ts` 的 `RxDBCapabilityVersionKind`）。核心不校验三者相等，而它们一旦分叉，
 * 「未认领能力守卫」报出的能力名就指不回任何一个插件名，用户拿着报错无从下手。
 */
export const WORKING_TREE_CAPABILITY = 'workingTree' as const;

/** 本包的包说明符；未认领能力守卫把它原样报给用户（`pnpm add <包名>`）。 */
export const PACKAGE_SPECIFIER = '@aiao/rxdb-plugin-working-tree';
