import { createStableKey } from './createStableKey.js';

/**
 * 游标身份的缺省字段。
 *
 * @remarks
 * `findByCursor` 强制 `orderBy` 非空且以 `id` 结尾
 * （`packages/rxdb/src/repository/Repository.ts` 的两处 `RxDBError`），
 * 因此正常调用一定能从 `orderBy` 取到字段名。`orderBy` 缺省 / 为空 / 不是数组时，
 * 查询本身会被核心拒绝——算 key 这一步只需给出**确定**结果，不代核心做校验，
 * 更不能在组件 setup / render 阶段提前抛错把错误指向错误的地方。
 */
const DEFAULT_CURSOR_FIELDS: readonly string[] = ['id'];

/** 承载游标实体的选项字段；`before` 与 `after` 互斥由核心校验。 */
const CURSOR_KEYS: readonly string[] = ['after', 'before'];

interface OrderByLike {
  field: string;
}

const isObjectLike = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/**
 * 是否是 {@link createStableKey} 认可的 plain object。
 *
 * @remarks
 * 判定规则与 `createStableKey` 内部保持逐字一致（`prototype` 为 `null` 或 `Object.prototype`）。
 * 只有 plain object 才做游标投影：`Map`/`Date` 等内建容器有自己的序列化分支，
 * 浅拷贝会把它们降级成普通对象，反而制造坍缩。
 */
const isPlainRecord = (value: unknown): value is Record<string, unknown> => {
  if (!isObjectLike(value) || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value) as object | null;
  return prototype === null || prototype === Object.prototype;
};

const isOrderByLike = (value: unknown): value is OrderByLike =>
  isObjectLike(value) && typeof value['field'] === 'string';

const readCursorFields = (orderBy: unknown): readonly string[] => {
  if (!Array.isArray(orderBy)) return DEFAULT_CURSOR_FIELDS;
  const fields = orderBy.filter(isOrderByLike).map(item => item.field);
  return fields.length > 0 ? fields : DEFAULT_CURSOR_FIELDS;
};

const projectCursor = (cursor: Record<string, unknown>, fields: readonly string[]): Record<string, unknown> => {
  const snapshot: Record<string, unknown> = {};
  for (const field of fields) {
    snapshot[field] = cursor[field];
  }
  return snapshot;
};

/**
 * 计算查询选项的内容 key，并把游标实体投影成确定的数据快照。
 *
 * @param options 查询选项；`after` / `before` 允许是真实实体实例
 * @param label 错误信息前缀，用于让报错带上调用方语境（如 `'RxDB query options'`）
 * @returns 与「选项内容 + 游标身份」一一对应的稳定 key
 * @throws {TypeError} 选项或游标身份字段中含函数、symbol、无法识别的宿主对象或循环引用时抛出
 *
 * @remarks
 * RVU-001 / RRE-002：`FindByCursorOptions.after/before` 的公开类型就是 `InstanceType<T>`，
 * 而实体由 `Object.create(EntityType.prototype)` 造出、再包一层只有 set 陷阱的 `Proxy`，
 * `Object.getPrototypeOf` 透传回 `EntityType.prototype` —— 整包丢给 {@link createStableKey}
 * 必然命中它的「非 plain 宿主对象」拒绝分支，组件在 setup / render 阶段直接抛 `TypeError`，
 * 「从某条继续往下滚」这个最常见用法一次查询都发不出去。
 *
 * 修法不是放开宿主对象兜底（那正是 `createStableKey` 要防的
 * 「`WeakMap`/DOM 节点的 `Object.keys` 同样为空、被静默视作等价」），
 * 而是让 key **理解游标语义**：游标身份 = `orderBy` 各字段在游标上的取值。
 * 因为 `orderBy` 必须以 `id` 结尾，这组取值足以唯一确定一个游标位置；
 * 非 `orderBy` 字段（标题、更新时间…）的变化不构成新游标，
 * 否则活查询回填这些字段就会触发重订阅 → 再回填的无限重查。
 *
 * 三框架绑定共用本函数，避免各写一套后语义漂移。
 *
 * 投影只发生在**顶层** `after` / `before`：自引用的 options 会把序列化带回原始对象、
 * 撞上未投影的游标原型，报「serializable」而非「circular」。两者都是 `TypeError`，
 * 都不产出 key、也不无限递归，自引用的查询选项本就不是受支持的输入。
 *
 * @example
 * ```ts
 * const key = createQueryOptionsKey(
 *   { where, orderBy: [{ field: 'createdAt', sort: 'desc' }, { field: 'id', sort: 'asc' }], after: entity },
 *   'RxDB query options'
 * );
 * // 同 identity 的新实例算出同一个 key；换一条游标才会变
 * ```
 */
export const createQueryOptionsKey = (options: unknown, label = 'Query options'): string => {
  if (!isPlainRecord(options)) return createStableKey(options, label);
  if (!CURSOR_KEYS.some(key => isObjectLike(options[key]))) return createStableKey(options, label);

  const fields = readCursorFields(options['orderBy']);
  const projected: Record<string, unknown> = { ...options };
  for (const key of CURSOR_KEYS) {
    const cursor = projected[key];
    if (isObjectLike(cursor)) {
      projected[key] = projectCursor(cursor, fields);
    }
  }
  return createStableKey(projected, label);
};
