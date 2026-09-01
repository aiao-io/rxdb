/**
 * 确定性种子数据。
 *
 * @remarks
 * **零随机、零 `Date.now()`**。每一列都是行序号 `i` 的纯函数，因此
 * `reset` 跑两遍读出的 250 行**逐字节相同**（D7），e2e 才能断言「第 3 页第 1 行是 X」
 * 而不是退化成「大概有几条」。
 *
 * 时间基准取 2025-01-01，每行 +1 小时，250 行铺到 2025-01-11——**全部落在过去**。
 * 这一条是 AC#15 的前提：token 里的读取水位线取「首页时刻的最大 `updatedAt`」，
 * 翻页途中新建的行（`updatedAt` = 服务端当前时刻）必须严格大于水位线才会被挡在快照外。
 *
 * 阶段 B 起本文件只保留**纯数据函数**（`seedIdAt` / `seedRowAt` / `seedRows`）与
 * 行形状 `RecipeRow`；node:sqlite 时代的 `seedDatabase` / `resetDatabase` 已随
 * `db.ts` 退役，写入走 `rxdb-store.ts` 的 {@link seedRxdbStore}（经引擎）。
 */

import { SEED_ROW_COUNT } from './config.ts';

/**
 * `recipes` 表的一行。
 *
 * @remarks
 * 业务列（`title` / `status` / `price` / `tag`）与 `http-protocol.md` 的示例逐字一致。
 *
 * `createdAt` 不在文档示例里，但**必须有**：协议说写端点与 `findByIds` 回「完整行」，
 * 而「完整」是按实体算的——`Recipe extends EntityBase`，基类预声明的 `createdAt`
 * 没写 `nullable`，客户端本地行缓存那张表上它就是 `NOT NULL`。少回这一列时网线上
 * 一切正常，错误发生在 upsert 落盘那一步（`NOT NULL constraint failed`）。
 */
export interface RecipeRow {
  id: string;
  title: string;
  status: string;
  price: number;
  tag: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 菜名词表。长度 10 与 `status` 的 3、`tag` 的 4 互质，组合不会周期性重叠。 */
const DISHES = ['Pasta', 'Risotto', 'Ramen', 'Curry', 'Tacos', 'Paella', 'Gnocchi', 'Pho', 'Bibimbap', 'Falafel'];

const STATUSES = ['published', 'draft', 'archived'];

/** 第四个取值是 `null`：`null` / `notNull` 两个算子要有真实数据才测得出来（AC#3）。 */
const TAGS: (string | null)[] = ['sale', 'new', 'classic', null];

/** 2025-01-01T00:00:00.000Z。`Date.UTC` 是纯函数，不是 `Date.now()`。 */
const SEED_EPOCH_MS = Date.UTC(2025, 0, 1);

const HOUR_MS = 3_600_000;

/**
 * `http-protocol.md`「端到端示例」里出现过的三个 id，占据前三行。
 *
 * @remarks
 * AC#2 要求文档里那五条 curl **逐字**能对着本地后端跑通（只换 baseUrl）。
 * 其中三条带着写死的示例 id：`by-ids` 和 `delete` 用 `1111…`，`PATCH` 用 `9999…`。
 * 种子里不存在这些 id 的话，`PATCH` 会诚实地回 404——协议上完全正确，
 * 但「照着文档复制一条命令，得到 404」不是一个活靶子该有的样子。
 *
 * 把它们钉在下标 0 / 1 / 2 上并不破坏确定性：`seedIdAt` 仍然是行序号的**纯函数**，
 * 两遍 reset 读出的行依旧逐字节相同。
 */
const DOC_EXAMPLE_IDS = [
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '99999999-9999-4999-8999-999999999999'
];

/**
 * 行序号 → id。
 *
 * @remarks
 * 前三行取自 {@link DOC_EXAMPLE_IDS}，其余形状仿 UUID v4 便于肉眼与 `create` 生成的真
 * `randomUUID()` 区分：种子 id 全零开头，尾段就是行序号。
 * **不用** `randomUUID()`——那会让确定性当场失败。
 */
export const seedIdAt = (index: number): string =>
  DOC_EXAMPLE_IDS[index] ?? `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;

/** 行序号 → 完整的一行。种子数据的唯一真相源，测试与断言都从这里取。 */
export const seedRowAt = (index: number): RecipeRow => ({
  id: seedIdAt(index),
  title: `${DISHES[index % DISHES.length]} #${String(index).padStart(3, '0')}`,
  status: STATUSES[index % STATUSES.length],
  // (i * 37) % 5000 得到 0…4999 的整数，除以 100 后是两位小数的价格，跨平台浮点表示一致。
  price: ((index * 37) % 5000) / 100,
  tag: TAGS[index % TAGS.length],
  // 种子行「建了就没再改过」，两个时刻相等是诚实取值；`update` 之后才会分叉。
  createdAt: new Date(SEED_EPOCH_MS + index * HOUR_MS).toISOString(),
  updatedAt: new Date(SEED_EPOCH_MS + index * HOUR_MS).toISOString()
});

/** 全部种子行，按 `(updatedAt, id)` 升序——与所有列表查询的排序一致。 */
export const seedRows = (count: number = SEED_ROW_COUNT): RecipeRow[] =>
  Array.from({ length: count }, (_unused, index) => seedRowAt(index));
