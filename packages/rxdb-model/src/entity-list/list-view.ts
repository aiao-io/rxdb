import type { EntityMetadata, OrderBy } from '@aiao/rxdb';
import type { ListTableConstructorOptions } from '@visactor/vtable';
import type { ColumnDefine } from '@visactor/vtable/es/ts-types/index.js';
import type { EntityTableRecord } from '../entity-table/interfaces.js';
import { modelText, type ModelI18n } from '../i18n.js';
import { defaultListOrderBy } from './manual-order-list.js';

/** 实体列表的字段配置、查询排序与单字段分组。 */
export interface ListViewState {
  /** 用户指定的字段顺序，其余字段按模型声明顺序追加。 */
  fieldOrder: string[];
  /** 隐藏的数据字段，操作列与选择列始终保留。 */
  hiddenFields: string[];
  /** 按优先级排列的查询排序规则。 */
  sorts: OrderBy[];
  /** 分组字段，空值表示平铺展示。 */
  groupBy: string | null;
}

/** 可配置的数据字段及查询能力。 */
export interface ListViewField {
  /** 字段名。 */
  field: string;
  /** 显示名称。 */
  title: string;
  /** 是否支持数据库排序与分组。 */
  sortable: boolean;
}

const SCALAR_TYPES = new Set([
  'uuid',
  'string',
  'enum',
  'number',
  'integer',
  'bigint',
  'boolean',
  'date',
  'oneToOne',
  'manyToOne'
]);
const SYSTEM_FIELDS = new Set(['id', 'createdAt', 'updatedAt']);

/** 创建独立的列表视图初始状态。 */
export function createListViewState(): ListViewState {
  return { fieldOrder: [], hiddenFields: [], sorts: [], groupBy: null };
}

/** 从表格列提取可配置字段，排除操作与选择列。 */
export function getListViewFields(columns: readonly ColumnDefine[]): ListViewField[] {
  return columns
    .filter(column => typeof column.field === 'string' && column.field !== 'actions' && column.field !== '__selected')
    .map(column => {
      const field = column.field as string;
      const propertyType = (column as ColumnDefine & { _propertyType?: string })._propertyType;
      return {
        field,
        title: typeof column.title === 'string' ? column.title : field,
        sortable: SYSTEM_FIELDS.has(field) || SCALAR_TYPES.has(propertyType ?? '')
      };
    });
}

/** 应用字段顺序与显隐，固定选择列和操作列的位置。 */
export function applyListViewColumns(columns: readonly ColumnDefine[], state: ListViewState): ColumnDefine[] {
  const data = columns.filter(column => column.field !== 'actions' && column.field !== '__selected');
  const ordered = [...new Set([...state.fieldOrder, ...data.map(column => column.field)])];
  const byField = new Map(data.map(column => [column.field, column]));
  const visible = ordered
    .filter(field => !state.hiddenFields.includes(field as string))
    .flatMap(field => {
      const column = byField.get(field);
      return column ? [column] : [];
    });
  if (data.length > 0 && visible.length === 0) throw new Error(modelText('text.c1493300cf'));
  return [
    ...columns.filter(column => column.field === '__selected'),
    ...visible,
    ...columns.filter(column => column.field === 'actions')
  ];
}

/** 构造数据库游标排序，分组字段优先，唯一键负责稳定分页。 */
export function buildListViewOrderBy(state: ListViewState, metadata: EntityMetadata | undefined): OrderBy[] {
  if (!state.groupBy && state.sorts.length === 0) return defaultListOrderBy(metadata);
  const sorts = state.sorts.length ? state.sorts : defaultListOrderBy(metadata);
  const groupSort = state.sorts.find(sort => sort.field === state.groupBy);
  const candidates: OrderBy[] =
    state.groupBy ? [{ field: state.groupBy, sort: groupSort?.sort ?? 'asc' }, ...sorts] : sorts;
  const unique = [...new Map(candidates.map(sort => [sort.field, sort])).values()];
  const idSort = unique.find(sort => sort.field === 'id');
  const withoutId = unique.filter(sort => sort.field !== 'id');
  return [...withoutId, { field: 'id', sort: idSort?.sort ?? withoutId.at(-1)?.sort ?? 'asc' }];
}

/** 将未填写的分组字段规范为 null，避免 VTable 丢弃 undefined 分组记录。 */
export function buildListViewRecords(records: EntityTableRecord[], state: ListViewState): EntityTableRecord[] {
  const field = state.groupBy;
  return field ? records.map(record => ({ ...record, [field]: record[field] ?? null })) : records;
}

/** 构造可折叠分组及已加载记录计数，不将当前页计数冒充全量统计。 */
export function buildListViewTableOptions(
  state: ListViewState,
  columns: readonly ColumnDefine[],
  i18n?: ModelI18n
): Partial<ListTableConstructorOptions> {
  const field = state.groupBy;
  if (!field) return { groupBy: [] };
  const column = columns.find(item => item.field === field);
  const title = typeof column?.title === 'string' ? column.title : field;
  const formatter = column?.fieldFormat as ((record: EntityTableRecord) => unknown) | undefined;
  return {
    groupBy: [field],
    hierarchyExpandLevel: 2,
    groupTitleFieldFormat: (group: Record<string, unknown>): string => {
      const children = group['children'] as EntityTableRecord[];
      const record = children[0];
      const value = record[field];
      const label =
        value == null ? modelText('text.7f05190592', undefined, i18n)
        : formatter ? formatter(record)
        : typeof value === 'boolean' ?
          value ? modelText('common.yes', undefined, i18n)
          : modelText('common.no', undefined, i18n)
        : String(value);
      return modelText('text.8149de63ce', { p0: title, p1: String(label), p2: children.length }, i18n);
    }
  };
}

/** 移动字段或排序规则，越过边界时保留原顺序。 */
export function moveListViewItem<T>(items: readonly T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  const next = [...items];
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) return next;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
