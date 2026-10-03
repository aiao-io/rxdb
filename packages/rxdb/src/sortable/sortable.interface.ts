/**
 * @fileoverview 手动排序的公开类型（US-028）
 *
 * 排序键类型是唯一的类型来源：`ISortableEntity` 用它声明非空的 `sortOrder`，
 * 树侧的 `ISortableTreeEntity` 用同一个键类型组合出可空的 `sortOrder`（US-031）。
 */

/**
 * 手动排序键所在的字段名
 *
 * @remarks
 * 固定，不可配置：启用 `manualOrder` 的实体必须自己声明这个字段。
 */
export const SORT_ORDER_FIELD = 'sortOrder';

/**
 * 分组手动排序的声明
 *
 * @remarks
 * 分组字段取值相同的行构成一条独立序列（排序域），各域的键互不相干、允许重复；
 * `groupBy` 为空数组等同 `manualOrder: true`（整表一条序列）。
 * 分组字段只能是实体自身的标量列（含多对一外键列，如 `categoryId`），非计算、可写、非加密；
 * NULL 是一个独立的组，默认排序里排在最前。
 *
 * @example
 * ```typescript
 * @Entity({ name: 'Todo', manualOrder: { groupBy: ['completed'] }, properties: [...] })
 * class Todo extends EntityBase implements ISortableEntity {}
 * ```
 */
export interface ManualOrderOptions {
  /** 分组字段，按声明顺序参与默认排序 */
  readonly groupBy: readonly string[];
}

/**
 * 手动排序键
 *
 * @remarks
 * 由 `@aiao/utils` 默认字母表生成的分数索引键，按码点字典序比较（大小写敏感）。
 * 是普通 `string` 别名而不是品牌类型：树实体要用它组合出 `SortOrderKey | null`，
 * 品牌类型会让既有的字符串赋值全部失配。
 */
export type SortOrderKey = string;

/**
 * 可手动排序实体的形状
 *
 * @remarks
 * 只是 TS 便利类型（编译后擦除），不是运行期声明——运行期以 `@Entity({ manualOrder })` 为准。
 *
 * @example
 * ```typescript
 * @Entity({ name: 'Category', manualOrder: true, properties: [{ name: 'sortOrder', type: PropertyType.string }] })
 * class Category extends EntityBase implements ISortableEntity {
 *   sortOrder!: SortOrderKey;
 * }
 * ```
 */
export interface ISortableEntity {
  /** 排序键，非空 */
  sortOrder: SortOrderKey;
}

/**
 * 重排目标：移动到两个邻居之间
 *
 * @typeParam Id - 实体主键类型
 *
 * @remarks
 * 移到序列首部时 `prevId` 为 `null`，移到尾部时 `nextId` 为 `null`；两侧都为 `null` 不合法，
 * 要移到末尾请用 {@link ReorderToGroupEnd}。
 */
export interface ReorderBetween<Id> {
  /** 目标位置之前的那一行；移到首部时为 `null` */
  prevId: Id | null;
  /** 目标位置之后的那一行；移到尾部时为 `null` */
  nextId: Id | null;
}

/**
 * 重排目标：追加到某个排序域的末尾
 *
 * @remarks
 * `group` 给出目标排序域的分组字段取值，键集合必须恰好等于声明的分组字段：
 * 整表排序为 `{}`，`groupBy: ['categoryId']` 为 `{ categoryId }`（NULL 组写 `null`）。
 * 目标组与行当前所在组不同即跨组移动，同时改写分组字段与 `sortOrder`。
 */
export interface ReorderToGroupEnd {
  /** 目标排序域的分组字段取值；整表排序为 `{}` */
  group: Readonly<Record<string, unknown>>;
}

/**
 * 重排目标位置
 *
 * @typeParam Id - 实体主键类型
 */
export type ReorderTarget<Id> = ReorderBetween<Id> | ReorderToGroupEnd;
