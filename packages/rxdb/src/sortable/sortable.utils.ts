/**
 * @fileoverview 手动排序的键计算（US-028 阶段 A / D）
 *
 * 只做「读锚点 → 校验 → 算键 → 写」，不开事务：调用方负责把传进来的仓库取自同一个
 * 主适配器事务的执行器，读锚点与写入因此同处一个事务，两次并发追加读不到同一个尾键。
 *
 * 分组字段取值相同的行是一条独立序列（排序域）：尾键、邻居、相邻复核一律限定在目标组内，
 * 分组取值用 `= 值` / `IS NULL` 匹配，NULL 是一个独立的组。
 *
 * 比较一律用 `<` / `>`（UTF-16 码元序）：合法键全是 ASCII，与码点序一致；`localeCompare`
 * 会把 `a0V` 排到 `a0l` 之后，与 SQL 侧的二进制比较不同序。
 */

import { generateKeyBetween, generateKeysBetween, isEqual, isValidOrderKey } from '@aiao/utils';
import type { EntityType } from '../entity/entity.interface.js';
import type { EntityMetadata } from '../entity/metadata.interface.js';
import type { FindOptions, OrderBy } from '../repository/query-options.interface.js';
import type { Rule } from '../repository/query.interface.js';
import type { IRepository } from '../repository/repository.interface.js';
import { getEntityStatus } from '../rxdb-utils.js';
import { SortOrderError } from './sortable-error.js';
import { SORT_ORDER_FIELD, type ReorderBetween, type ReorderTarget, type SortOrderKey } from './sortable.interface.js';

/** 排序键相关字段的最小行形状 */
interface SortableRow {
  id: unknown;
  sortOrder?: unknown;
}

/** 手动排序相关的那部分元数据 */
type ManualOrderMetadata = Pick<EntityMetadata, 'name' | 'manualOrder'>;

/** 一个排序域的分组字段取值；NULL 组的取值为 `null` */
type GroupValues = Readonly<Record<string, unknown>>;

/** 尾部读取的排序：与组内默认排序完全反向，第一行就是序列末尾 */
const TAIL_ORDER_BY: OrderBy[] = [
  { field: SORT_ORDER_FIELD, sort: 'desc' },
  { field: 'id', sort: 'desc' }
];

/**
 * 实体是否启用了手动排序
 *
 * @param metadata - 实体元数据
 * @returns 声明了 `manualOrder: true` 或 `manualOrder: { groupBy }` 时为 `true`
 */
export const isManualOrderEntity = (metadata: Pick<EntityMetadata, 'manualOrder'>): boolean =>
  metadata.manualOrder === true || typeof metadata.manualOrder === 'object';

/**
 * 手动排序实体的分组字段
 *
 * @param metadata - 实体元数据
 * @returns 按声明顺序的分组字段；`manualOrder: true`（整表一条序列）或未启用时为空数组
 */
export const manualOrderGroupFields = (metadata: Pick<EntityMetadata, 'manualOrder'>): readonly string[] =>
  typeof metadata.manualOrder === 'object' ? metadata.manualOrder.groupBy : [];

/**
 * 给手动排序实体的查询补上默认排序
 *
 * @param metadata - 实体元数据
 * @param options - 调用方的查询选项，不会被改写
 * @returns 未给 `orderBy`（或给了空数组）时补成 `[分组字段… asc, sortOrder asc, id asc]` 的新对象；
 *   其余情况原样返回
 *
 * @remarks
 * 调用方显式给出的排序原样尊重，不追加、不改写。空数组按「没给」处理：它表达的是「不关心顺序」，
 * 而活查询的增量合并只在 `orderBy` 非空时重排，留空会让拖拽后的列表不换位。
 * 分组字段排在前面，同组的行因此连续；NULL 组在两端 SQL 与内存比较里都排在最前。
 * 返回的对象要同时交给 runner 与 `createTask`——缓存键与合并选项都得是归一化后的那份。
 */
export const normalizeManualOrderBy = <O extends { orderBy?: OrderBy[] }>(
  metadata: Pick<EntityMetadata, 'manualOrder'>,
  options: O
): O => {
  if (!isManualOrderEntity(metadata) || options.orderBy?.length) return options;
  const fields = [...manualOrderGroupFields(metadata), SORT_ORDER_FIELD, 'id'];
  return { ...options, orderBy: fields.map(field => ({ field, sort: 'asc' as const })) };
};

const isIndexOf = (ids: readonly unknown[], index: number): boolean =>
  Number.isInteger(index) && index >= 0 && index < ids.length;

/**
 * 把「第 `fromIndex` 行拖到第 `toIndex` 行」换算成 `Repository.reorder()` 的邻居目标
 *
 * @typeParam Id - 实体主键类型
 * @param ids - 拖放前当前排序域的 id 序列（与界面显示顺序一致）
 * @param fromIndex - 被拖动行在 `ids` 里的下标
 * @param toIndex - 被拖动行放下后的最终下标
 * @returns 落点前后的邻居；原位放下（`fromIndex === toIndex`）返回 `null`，调用方不应发起重排
 * @throws {@link RangeError} 下标不是 `ids` 的合法整数下标，或序列不足两行
 *
 * @remarks
 * 三端 todo 页与 `EntityList` 共用这一份换算：下移时落点前后是原 `toIndex` / `toIndex + 1` 行，
 * 上移时是原 `toIndex - 1` / `toIndex` 行；首尾一侧为 `null`。
 *
 * @example
 * ```typescript
 * const target = reorderTargetForMove(rows.map(row => row.id), from, to);
 * if (target) await repository.reorder(rows[from].id, target);
 * ```
 */
export const reorderTargetForMove = <Id>(
  ids: readonly Id[],
  fromIndex: number,
  toIndex: number
): ReorderBetween<Id> | null => {
  if (ids.length < 2 || !isIndexOf(ids, fromIndex) || !isIndexOf(ids, toIndex)) {
    throw new RangeError(`拖放下标越界：from=${fromIndex} to=${toIndex} length=${ids.length}`);
  }
  if (fromIndex === toIndex) return null;
  const rest = ids.filter((_, index) => index !== fromIndex);
  return { prevId: rest[toIndex - 1] ?? null, nextId: rest[toIndex] ?? null };
};

/**
 * 断言用户写入的排序键合法
 *
 * @param entity - 实体名，用于报错
 * @param key - 待校验的键
 * @throws {@link SortOrderError} `reason` 为 `'invalidKey'`：空串、非字符串、格式不合法或不属于默认字母表
 */
export function assertSortOrderKey(entity: string, key: unknown): asserts key is SortOrderKey {
  if (!isValidOrderKey(key)) {
    throw new SortOrderError(entity, 'invalidKey', `sortOrder 不是合法排序键：${JSON.stringify(key)}`);
  }
}

/** 锚点（尾键 / 邻居）的键不合法即数据已脏，拒绝在它上面算键 */
function assertAnchorKey(entity: string, key: unknown, label: string): asserts key is SortOrderKey {
  if (!isValidOrderKey(key)) {
    throw new SortOrderError(entity, 'corruptAnchor', `${label}的 sortOrder 不是合法排序键：${JSON.stringify(key)}`);
  }
}

/** 键为空（`undefined` / `null`）即「用户没给」，由引擎追加 */
const isKeyMissing = (row: SortableRow): boolean => row.sortOrder == null;

/**
 * 是否有行缺排序键
 *
 * @param rows - 待写入的行
 */
export const hasMissingSortOrder = (rows: Iterable<SortableRow>): boolean => [...rows].some(isKeyMissing);

/**
 * 断言这批行里用户显式给出的排序键全部合法；缺键的行跳过（留给追加）
 *
 * @param entity - 实体名
 * @param rows - 待创建的行
 * @throws {@link SortOrderError} 任一显式键不合法
 */
export const assertExplicitSortOrders = (entity: string, rows: Iterable<SortableRow>): void => {
  for (const row of rows) {
    if (!isKeyMissing(row)) assertSortOrderKey(entity, row.sortOrder);
  }
};

const findRows = (repository: IRepository<EntityType>, options: FindOptions): Promise<SortableRow[]> =>
  repository.find(options) as Promise<SortableRow[]>;

const whereRules = (rules: Rule<InstanceType<EntityType>>[]): FindOptions['where'] => ({ combinator: 'and', rules });

const findById = async (repository: IRepository<EntityType>, id: unknown): Promise<SortableRow | undefined> => {
  const [row] = await findRows(repository, {
    where: whereRules([{ field: 'id', operator: '=', value: id } as Rule<InstanceType<EntityType>>]),
    limit: 1
  });
  return row;
};

const fieldValue = (row: object, field: string): unknown => (row as Record<string, unknown>)[field];

/** 行（或调用方给的 `group`）在各分组字段上的取值，缺省与 `undefined` 一律归为 `null` */
const groupValuesOf = (fields: readonly string[], row: object): GroupValues =>
  Object.fromEntries(fields.map(field => [field, fieldValue(row, field) ?? null]));

const isSameGroup = (fields: readonly string[], a: GroupValues, b: GroupValues): boolean =>
  fields.every(field => isEqual(a[field], b[field]));

/** 限定在一个排序域内的条件：NULL 组用 `IS NULL`，`= NULL` 匹配不到任何行 */
const groupRules = (fields: readonly string[], values: GroupValues): Rule<InstanceType<EntityType>>[] =>
  fields.map(
    field =>
      (values[field] === null ? { field, operator: 'null' } : { field, operator: '=', value: values[field] }) as Rule<
        InstanceType<EntityType>
      >
  );

/** 组内末尾那一行；组为空时为 `undefined` */
const readTailRow = async (
  repository: IRepository<EntityType>,
  rules: Rule<InstanceType<EntityType>>[]
): Promise<SortableRow | undefined> => {
  const [tail] = await findRows(repository, { where: whereRules(rules), orderBy: TAIL_ORDER_BY, limit: 1 });
  return tail;
};

/**
 * 一条待追加排序键的行
 *
 * @remarks
 * `persisted` 为真即库里已有这行（改了分组字段的更新）：读新组尾键时要把它排除——
 * 同一事务里它可能已带着新的分组取值，自己不能当自己的锚点。
 */
export interface AppendRow {
  /** 待追加的行，追加后 `sortOrder` 被就地写上新键 */
  row: SortableRow;
  /** 库里是否已有这行 */
  persisted: boolean;
}

interface AppendGroup {
  values: GroupValues;
  rows: AppendRow[];
}

/** 按目标组拆分，组内保持批内顺序 */
const splitByGroup = (fields: readonly string[], rows: readonly AppendRow[]): AppendGroup[] => {
  const groups: AppendGroup[] = [];
  for (const item of rows) {
    const values = groupValuesOf(fields, item.row);
    const group = groups.find(candidate => isSameGroup(fields, candidate.values, values));
    if (group) group.rows.push(item);
    else groups.push({ values, rows: [item] });
  }
  return groups;
};

const appendToGroup = async (
  repository: IRepository<EntityType>,
  entity: string,
  fields: readonly string[],
  { values, rows }: AppendGroup
): Promise<void> => {
  const excluded = rows.filter(item => item.persisted).map(item => item.row.id);
  const rules = [
    ...groupRules(fields, values),
    ...(excluded.length > 0 ?
      [{ field: 'id', operator: 'notIn', value: excluded } as Rule<InstanceType<EntityType>>]
    : [])
  ];
  const tail = await readTailRow(repository, rules);
  if (tail) assertAnchorKey(entity, tail.sortOrder, '尾行');
  const keys = generateKeysBetween((tail?.sortOrder as SortOrderKey | undefined) ?? null, null, rows.length);
  rows.forEach(({ row }, index) => {
    row.sortOrder = keys[index];
  });
};

/**
 * 把行按批内顺序追加到各自目标组的末尾
 *
 * @param repository - **取自主适配器事务执行器**的仓库
 * @param metadata - 实体元数据
 * @param rows - 待追加的行，迭代顺序即批内顺序；新键就地写到 `row.sortOrder`
 * @throws {@link SortOrderError} 任一目标组的尾键不合法（`'corruptAnchor'`），一条都不写
 *
 * @remarks
 * 每个目标组一次读尾键、一次 `generateKeysBetween(尾键, null, n)`：同组 n 条互不碰撞，也不必逐条读尾键。
 * 键写到实体上而不是另给一份 patch，`getEntityStatus(entity).patch` 才会带上它。
 */
export const appendToGroupTails = async (
  repository: IRepository<EntityType>,
  metadata: ManualOrderMetadata,
  rows: readonly AppendRow[]
): Promise<void> => {
  const fields = manualOrderGroupFields(metadata);
  for (const group of splitByGroup(fields, rows)) await appendToGroup(repository, metadata.name, fields, group);
};

/**
 * 这次更新是否把行改到了别的组、又没给排序键——是则要在事务内追加到新组末尾
 *
 * @param metadata - 实体元数据
 * @param entity - 被更新的实体（带实体状态，用它的 `origin` 判断分组取值是否真变了）
 * @param patch - 本次写入的字段
 */
export const isRegroupWithoutKey = (
  metadata: Pick<EntityMetadata, 'manualOrder'>,
  entity: object,
  patch: object
): boolean => {
  const fields = manualOrderGroupFields(metadata);
  if (fields.length === 0 || SORT_ORDER_FIELD in patch) return false;
  const origin = groupValuesOf(fields, getEntityStatus(entity).origin);
  return fields.some(field => field in patch && !isEqual(fieldValue(patch, field) ?? null, origin[field]));
};

/**
 * 门面 `update(entity, patch)` 的目标组：patch 里给了的分组字段取 patch，没给的取实体当前值
 *
 * @returns 一条已在库里的待追加行，追加后从 `row.sortOrder` 取新键
 */
export const regroupRow = (
  metadata: Pick<EntityMetadata, 'manualOrder'>,
  entity: SortableRow,
  patch: object
): AppendRow => {
  const values = manualOrderGroupFields(metadata).map(field => [
    field,
    field in patch ? fieldValue(patch, field) : fieldValue(entity, field)
  ]);
  return { row: { id: entity.id, ...Object.fromEntries(values) }, persisted: true };
};

/** `group` 的键集合必须恰好等于分组字段 */
const assertGroupTarget = (entity: string, fields: readonly string[], group: GroupValues): void => {
  const keys = Object.keys(group);
  if (keys.length === fields.length && keys.every(key => fields.includes(key))) return;
  throw new SortOrderError(
    entity,
    'invalidTarget',
    `group 的键必须恰好是分组字段 {${fields.join(', ')}}，实际为 {${keys.join(', ')}}`
  );
};

/**
 * 断言重排目标本身成立（不读库）
 *
 * @param metadata - 实体元数据
 * @param id - 被移动行的 id
 * @param target - 目标位置
 * @throws {@link SortOrderError} `reason` 为 `'invalidTarget'`
 */
export const assertReorderTarget = (
  metadata: ManualOrderMetadata,
  id: unknown,
  target: ReorderTarget<unknown>
): void => {
  const entity = metadata.name;
  if ('group' in target) {
    assertGroupTarget(entity, manualOrderGroupFields(metadata), target.group);
    return;
  }
  const { prevId, nextId } = target;
  if (prevId === null && nextId === null) {
    throw new SortOrderError(entity, 'invalidTarget', '前后邻居不能都为空；移到末尾请用 { group }');
  }
  if (prevId === id || nextId === id || prevId === nextId) {
    throw new SortOrderError(entity, 'invalidTarget', '邻居不能是被移动的行，前后邻居也不能是同一行');
  }
};

type Neighbor = SortableRow & { sortOrder: SortOrderKey };

/** 一次重排要写的字段：跨组时连同分组字段；`null` 即已在目标位置、零写 */
type Placement = Readonly<Record<string, unknown>> | null;

const readNeighbor = async (
  repository: IRepository<EntityType>,
  entity: string,
  id: unknown,
  label: string
): Promise<Neighbor | null> => {
  if (id === null) return null;
  const neighbor = await findById(repository, id);
  if (!neighbor) throw new SortOrderError(entity, 'staleTarget', `${label} ${String(id)} 已不存在`);
  assertAnchorKey(entity, neighbor.sortOrder, label);
  return neighbor as Neighbor;
};

/** 目标组取自邻居；两个邻居不在同一组即调用方看到的顺序已过期 */
const neighborGroup = (entity: string, fields: readonly string[], neighbors: readonly Neighbor[]): GroupValues => {
  const [values, ...others] = neighbors.map(neighbor => groupValuesOf(fields, neighbor));
  if (others.some(other => !isSameGroup(fields, values, other))) {
    throw new SortOrderError(entity, 'staleTarget', '前后邻居已不在同一组');
  }
  return values;
};

/**
 * 两邻居之间（含与邻居同键的行）除被移动行外，目标组内不得还有别的行
 *
 * @remarks
 * 用闭区间而不是开区间：与邻居同键、按 `id` 排在两邻之间的行同样破坏相邻。
 * 别的组键可以重复，所以条件要带上目标组。
 */
const assertAdjacent = async (
  repository: IRepository<EntityType>,
  entity: string,
  row: SortableRow,
  [lower, upper]: readonly [Neighbor | null, Neighbor | null],
  scope: Rule<InstanceType<EntityType>>[]
): Promise<void> => {
  const bounded = [lower, upper].filter(neighbor => neighbor !== null);
  const rules = [
    ...scope,
    ...(lower ? [{ field: SORT_ORDER_FIELD, operator: '>=', value: lower.sortOrder }] : []),
    ...(upper ? [{ field: SORT_ORDER_FIELD, operator: '<=', value: upper.sortOrder }] : []),
    { field: 'id', operator: 'notIn', value: [row.id, ...bounded.map(neighbor => neighbor.id)] }
  ] as Rule<InstanceType<EntityType>>[];
  const [between] = await findRows(repository, { where: whereRules(rules), limit: 1 });
  if (between) {
    throw new SortOrderError(entity, 'staleTarget', `邻居已不相邻：${String(between.id)} 排在它们之间`);
  }
};

/** 被移动行已经在目标位置：键合法且严格落在两邻居之间 */
const isAlreadyBetween = (key: unknown, lower: SortOrderKey | null, upper: SortOrderKey | null): boolean =>
  isValidOrderKey(key) && (lower === null || lower < key) && (upper === null || key < upper);

/** 跨组时要连同写入的分组字段；同组为空 */
const groupPatch = (fields: readonly string[], row: SortableRow, values: GroupValues): GroupValues =>
  isSameGroup(fields, groupValuesOf(fields, row), values) ? {} : values;

const placeBetweenNeighbors = async (
  repository: IRepository<EntityType>,
  entity: string,
  fields: readonly string[],
  row: SortableRow,
  { prevId, nextId }: ReorderBetween<unknown>
): Promise<Placement> => {
  const lower = await readNeighbor(repository, entity, prevId, '前邻居');
  const upper = await readNeighbor(repository, entity, nextId, '后邻居');
  const values = neighborGroup(
    entity,
    fields,
    [lower, upper].filter(neighbor => neighbor !== null)
  );
  if (lower && upper && !(lower.sortOrder < upper.sortOrder)) {
    throw new SortOrderError(
      entity,
      'corruptAnchor',
      `前后邻居不满足 prev < next：${JSON.stringify(lower.sortOrder)} / ${JSON.stringify(upper.sortOrder)}`
    );
  }
  await assertAdjacent(repository, entity, row, [lower, upper], groupRules(fields, values));
  const lowerKey = lower?.sortOrder ?? null;
  const upperKey = upper?.sortOrder ?? null;
  const patch = groupPatch(fields, row, values);
  if (Object.keys(patch).length === 0 && isAlreadyBetween(row.sortOrder, lowerKey, upperKey)) return null;
  return { ...patch, [SORT_ORDER_FIELD]: generateKeyBetween(lowerKey, upperKey) };
};

const placeAtGroupTail = async (
  repository: IRepository<EntityType>,
  entity: string,
  fields: readonly string[],
  row: SortableRow,
  group: GroupValues
): Promise<Placement> => {
  const values = groupValuesOf(fields, group);
  const tail = await readTailRow(repository, groupRules(fields, values));
  if (tail?.id === row.id) return null;
  if (tail) assertAnchorKey(entity, tail.sortOrder, '尾行');
  const key = generateKeyBetween((tail?.sortOrder as SortOrderKey | undefined) ?? null, null);
  return { ...groupPatch(fields, row, values), [SORT_ORDER_FIELD]: key };
};

/**
 * 把一行移到目标位置：同组只写 `sortOrder`，跨组连同分组字段
 *
 * @param repository - **取自主适配器事务执行器**的仓库
 * @param metadata - 实体元数据
 * @param id - 被移动行的 id
 * @param target - 目标位置，须先经 {@link assertReorderTarget}
 * @returns 移动后的行；已在目标位置时原样返回、零写
 * @throws {@link SortOrderError} 移动行不存在（`'notFound'`）、邻居不存在 / 不再相邻 / 不在同一组（`'staleTarget'`）、
 *   锚点键不合法（`'corruptAnchor'`）
 *
 * @remarks
 * 被移动行自身的旧键不是锚点：把空串或非法键的行拖进两个合法邻居之间是合法写入。
 * 目标组由邻居（或 `group`）决定，原组剩下的行一条都不改写。
 */
export const reorderRow = async <T extends EntityType>(
  repository: IRepository<T>,
  metadata: ManualOrderMetadata,
  id: unknown,
  target: ReorderTarget<unknown>
): Promise<InstanceType<T>> => {
  const untyped = repository as unknown as IRepository<EntityType>;
  const entity = metadata.name;
  const row = await findById(untyped, id);
  if (!row) throw new SortOrderError(entity, 'notFound', `要移动的行 ${String(id)} 不存在`);
  const fields = manualOrderGroupFields(metadata);
  const placement =
    'group' in target ?
      await placeAtGroupTail(untyped, entity, fields, row, target.group)
    : await placeBetweenNeighbors(untyped, entity, fields, row, target);
  const moving = row as InstanceType<T>;
  if (placement === null) return moving;
  return repository.update(moving, placement as Partial<InstanceType<T>>);
};
