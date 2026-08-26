import { Entity, EntityBase, PropertyType, SyncType } from '@aiao/rxdb';

/**
 * demo 实体。
 *
 * @remarks
 * `name` / `tableName` 与四个字段名都**逐字**取自
 * `website/docs/adapters/http-protocol.md`「端到端示例」里的 `Recipe` → `recipes`。
 * 那份文档里的 curl 必须能原样打到这个后端上（AC#2），所以字段名不是随便起的——
 * 改一个字，文档里的例子就成了跑不通的伪代码。
 *
 * `tag` 可空：AC#3 的 `null` 算子需要一批真的没有 tag 的行才验得出来。
 *
 * 同步策略写在**实体级**而不是库级。库级 QueryCache 会把 `RxDBBranch` 这个系统实体
 * 一起卷进来，而它在 HTTP 后端并不存在，`init()` 会直接拒绝
 * （见 `packages/rxdb-adapter-http/tests/wire-integration.spec.ts` 的同一处注释）。
 *
 * `syncStaleTime: 0` 关掉「刚同步过」记忆。默认的 1000ms 窗口是给翻页交互省 round-trip 用的，
 * 完全合理——但本 demo 的全部意义是**把协议流量摆出来看**，而「重新查询」若落在窗口内
 * 就直接读本地投影：一次请求都不发、也不报错，页面上什么都没变。
 * 观测台上没有比「按钮按了但什么都没发生，且这是对的」更坏的现象。
 * 配 `0` 后每次读都回远端校验，按钮按下去必有流量。
 */
@Entity({
  name: 'Recipe',
  tableName: 'recipes',
  properties: [
    { name: 'title', type: PropertyType.string, searchable: true },
    { name: 'status', type: PropertyType.string },
    { name: 'price', type: PropertyType.number },
    { name: 'tag', type: PropertyType.string, nullable: true }
  ],
  sync: {
    type: SyncType.QueryCache,
    local: { adapter: 'wa-sqlite', syncStaleTime: 0 },
    remote: { adapter: 'http' }
  }
})
export class Recipe extends EntityBase {
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
