/**
 * demo 实体。
 *
 * @remarks
 * 阶段 A（US-216）起，`Recipe` 从共享模块 `@modules/recipes-domain` 导入——schema 单一来源
 * （D1），前端 QueryCache 策略与 `syncStaleTime: 0` 的逐字说明见该模块的 `recipe-entity.ts`。
 * 这里保留 re-export，让 `setup_rxdb_http.ts` / `app.ts` 等既有导入点不用改。
 *
 * 同步策略写在**实体级**而不是库级。库级 QueryCache 会把 `RxDBBranch` 这个系统实体
 * 一起卷进来，而它在 HTTP 后端并不存在，`init()` 会直接拒绝。
 */
export { Recipe } from '@modules/recipes-domain';
export type { RecipeWireRow } from '@modules/recipes-domain';
