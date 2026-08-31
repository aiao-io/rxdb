import { Entity, EntityBase, SyncType } from '@aiao/rxdb';

import { RECIPE_SCHEMA } from './recipe-schema.js';

/**
 * 前端 Recipe —— QueryCache 策略，行为与迁移前逐字一致。
 *
 * @remarks
 * `syncStaleTime: 0` 关掉「刚同步过」记忆：默认的 1000ms 窗口是给翻页交互省 round-trip 用的，
 * 完全合理——但 demo 的全部意义是**把协议流量摆出来看**，而「重新查询」若落在窗口内
 * 就直接读本地投影：一次请求都不发、也不报错，页面上什么都没变。配 `0` 后每次读都回远端校验。
 *
 * 同步策略写在**实体级**而不是库级。库级 QueryCache 会把 `RxDBBranch` 这个系统实体
 * 一起卷进来，而它在 HTTP 后端并不存在，`init()` 会直接拒绝。
 */
@Entity({
  ...RECIPE_SCHEMA,
  sync: {
    type: SyncType.QueryCache,
    local: { adapter: 'wa-sqlite', syncStaleTime: 0 },
    remote: { adapter: 'http' }
  }
})
export class Recipe extends EntityBase<string> {
  // 一律用 `declare`：字段的读写由 RxDB 的实体代理接管，这里只是给 TypeScript 一个形状。
  // 写成 `title!: string` 会在 `useDefineForClassFields`（target es2025 的默认值）下
  // 真的 `defineProperty(this, 'title', { value: undefined })`，把代理的取值器盖掉，
  // 于是每个字段都读出 `undefined`——而类型检查一路绿灯。

  /** 菜谱标题。`contains` 算子的靶子。 */
  declare title: string;
  /** `draft` / `published` / `archived`。`=` 算子的靶子。 */
  declare status: string;
  /** 单价（分）。`between` 算子的靶子。 */
  declare price: number;
  /** 分类标签，可为空。`in` 与 `null` 两个算子共用的靶子。 */
  declare tag: string | null;
}

/**
 * 后端 ServerRecipe —— 本地 pglite，无远端同步。
 *
 * @remarks
 * `SyncType.None + local: pglite`：后端实例是全租户共享的权威库，不触发任何远端路径。
 * 与前端 {@link Recipe} 用同一份 {@link RECIPE_SCHEMA}，只差同步策略——这是 D1 的
 * 「一份 schema 常量装饰出两个类」的路，等核心的实例级 sync 覆盖能力落地后收敛为单类。
 */
@Entity({
  ...RECIPE_SCHEMA,
  sync: { type: SyncType.None, local: { adapter: 'pglite' } }
})
export class ServerRecipe extends EntityBase<string> {
  declare title: string;
  declare status: string;
  declare price: number;
  declare tag: string | null;
}
