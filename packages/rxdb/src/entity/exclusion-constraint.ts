/**
 * @fileoverview 区间排他约束（US-030 阶段 C）：`EntityMetadataOptions.exclusions`。
 *
 * 形状是「相等列 + 区间维」：相等列全部相等、且**每一维**区间都相交，两行才冲突。
 * `equal` 至少一列，`ranges` 至少一维；区间维只接受时间类与整数列，`bounds` 限 `[)` / `[]`，
 * 端点 NULL 即该侧无界（AC#13）。
 *
 * 两后端同一语义：
 * - PG：`EXCLUDE USING gist (<equal> WITH =, <range> WITH &&, …)`，时间列取 `tstzrange`、
 *   整数取 `int8range`，`=` 上 GiST 靠 `btree_gist`；
 * - SQLite：每条排他两个触发器（插入 / 更新，名字为约束名加 `_i` / `_u`），按主键排除行自身。
 *
 * 空区间与倒置区间（`from > to`）不与任何行冲突：PG 的 `[)` 空区间天然如此，倒置区间在 PG 侧以
 * `CASE` 映射成 `'empty'`——否则范围构造函数先抛 `22000`，与 SQLite 侧的错误类分叉。要拒绝倒置
 * 区间请另加 CHECK（`from <= to`），与「要拒 NULL 须显式 `notNull`」同口径。
 *
 * 命名：`ex_` + 表名 + `name` + 规范化定义 8 位哈希；定义含 namespace——SQLite 触发器名是库级的。
 */

import { RxDBError } from '../RxDBError.js';
import { quoteSqlIdentifier } from '../system/sql-literal.js';
import { storageConstraintName } from './constraint-name.js';
import type { EntityMetadata } from './metadata.interface.js';
import { PropertyType } from './property-types.interface.js';

/** 区间排他确定性名字的前缀。 */
export const EXCLUSION_NAME_PREFIX = 'ex_';

/** 区间维允许的边界：`[)` 左闭右开、`[]` 两端闭合。 */
export const EXCLUSION_BOUNDS = ['[)', '[]'] as const;

/** 区间维的边界。 */
export type ExclusionBounds = (typeof EXCLUSION_BOUNDS)[number];

/** 区间排他的一维区间：起止两列与边界。 */
export interface EntityExclusionRangeOptions {
  /** 区间起点列（属性名）；值为 NULL 即该侧无界。 */
  from: string;
  /** 区间终点列（属性名）；值为 NULL 即该侧无界。 */
  to: string;
  /** 区间边界。 */
  bounds: ExclusionBounds;
}

/**
 * 实体级区间排他声明。
 *
 * @example
 * ```typescript
 * @Entity({
 *   exclusions: [{
 *     name: 'occurrence_no_overlap',
 *     equal: ['bomLineId'],
 *     ranges: [
 *       { from: 'effectiveFrom', to: 'effectiveTo', bounds: '[)' },
 *       { from: 'unitFrom', to: 'unitTo', bounds: '[]' }
 *     ]
 *   }]
 * })
 * class BomLineOccurrence extends EntityBase {}
 * ```
 */
export interface EntityExclusionMetadataOptions {
  /** 作者给的约束名，限 `[a-z][a-z0-9_]*`，进确定性约束名的中段。 */
  name: Uncapitalize<string>;
  /** 相等列（属性名或关系外键名），至少一列；任一列为 NULL 的行不参与冲突（两后端一致）。 */
  equal: readonly string[];
  /** 区间维，至少一维；全部维同时相交才算冲突。 */
  ranges: readonly EntityExclusionRangeOptions[];
}

/** 归一化之后的区间排他元数据（与 {@link EntityExclusionMetadataOptions} 同形状）。 */
export type EntityExclusionMetadata = EntityExclusionMetadataOptions;

/** 区间维的值域：决定 PG 侧的范围类型（`tstzrange` / `int8range`）与端点值的 JS 形态。 */
export type ExclusionRangeKind = 'timestamp' | 'integer' | 'bigint';

/** 编译后的一列：属性名与物理列名。 */
export interface CompiledExclusionColumn {
  /** 声明里的字段名（属性名或关系外键名）。 */
  field: string;
  /** 物理列名。 */
  column: string;
}

/** 编译后的一维区间。 */
export interface CompiledExclusionRange {
  /** 起点列。 */
  from: CompiledExclusionColumn;
  /** 终点列。 */
  to: CompiledExclusionColumn;
  /** 边界。 */
  bounds: ExclusionBounds;
  /** 值域。 */
  kind: ExclusionRangeKind;
}

/** 编译后的区间排他：两后端 DDL、漂移比对与违约归一化共用。 */
export interface CompiledExclusionConstraint {
  /** 确定性约束名（`ex_` 起头，含定义哈希）。 */
  name: string;
  /** 相等列。 */
  equal: readonly CompiledExclusionColumn[];
  /** 区间维。 */
  ranges: readonly CompiledExclusionRange[];
}

/** 相等列允许的属性类型：两后端都有确定的相等语义，PG 侧 `btree_gist` 都有运算符类。 */
const EQUAL_PROPERTY_TYPES: ReadonlySet<string> = new Set([
  PropertyType.uuid,
  PropertyType.string,
  PropertyType.enum,
  PropertyType.integer,
  PropertyType.bigint,
  PropertyType.boolean,
  PropertyType.date
]);

/** 区间维允许的属性类型与对应值域。 */
const RANGE_KINDS: ReadonlyMap<string, ExclusionRangeKind> = new Map([
  [PropertyType.date, 'timestamp'],
  [PropertyType.integer, 'integer'],
  [PropertyType.bigint, 'bigint']
]);

/** 相等列解析：实体自身标量属性或关系外键列。 */
const resolveEqualColumn = (metadata: EntityMetadata, field: string, subject: string): CompiledExclusionColumn => {
  const label = `${subject} 的相等列 '${field}'`;
  if (typeof field !== 'string' || field.includes('.')) {
    throw new RxDBError(`${label} 非法：只允许实体自身的列，不支持关系路径`);
  }
  const property = metadata.propertyMap.get(field);
  if (property) {
    if (!EQUAL_PROPERTY_TYPES.has(property.type)) {
      throw new RxDBError(
        `${label} 是 ${property.type} 列：只接受 ${Array.from(EQUAL_PROPERTY_TYPES).join(' / ')}（两后端相等语义一致的类型）`
      );
    }
    if ((property as { encrypted?: boolean }).encrypted) {
      throw new RxDBError(`${label} 是加密列：比较的是密文`);
    }
    return { field, column: property.columnName };
  }
  const foreignKeyIndex = metadata.foreignKeyNames.indexOf(field);
  if (foreignKeyIndex >= 0) return { field, column: metadata.foreignKeyColumnNames[foreignKeyIndex] };
  throw new RxDBError(`${label} 引用了不存在的字段`);
};

/** 区间端点解析：只认实体自身的时间类 / 整数属性。 */
const resolveRangeEndpoint = (
  metadata: EntityMetadata,
  field: string,
  label: string
): { column: CompiledExclusionColumn; kind: ExclusionRangeKind } => {
  const property = typeof field === 'string' ? metadata.propertyMap.get(field) : undefined;
  if (!property) {
    throw new RxDBError(`${label} 引用了不存在的字段：'${String(field)}'（区间端点只接受实体自身属性）`);
  }
  const kind = RANGE_KINDS.get(property.type);
  if (!kind) {
    throw new RxDBError(`${label} '${field}' 是 ${property.type} 列：区间维只接受 date / integer / bigint`);
  }
  if ((property as { encrypted?: boolean }).encrypted) {
    throw new RxDBError(`${label} '${field}' 是加密列：密文不能做区间比较`);
  }
  return { column: { field, column: property.columnName }, kind };
};

/** 编译一维区间：起止两列同类型、边界合法。 */
const compileRange = (
  metadata: EntityMetadata,
  range: EntityExclusionRangeOptions,
  label: string
): CompiledExclusionRange => {
  if (range === null || typeof range !== 'object') {
    throw new RxDBError(`${label} 必须是 { from, to, bounds } 对象`);
  }
  if (!(EXCLUSION_BOUNDS as readonly string[]).includes(range.bounds)) {
    throw new RxDBError(`${label} 的 bounds 非法：${JSON.stringify(range.bounds)}，只能是 '[)' / '[]'`);
  }
  const from = resolveRangeEndpoint(metadata, range.from, `${label} 的 from`);
  const to = resolveRangeEndpoint(metadata, range.to, `${label} 的 to`);
  if (from.kind !== to.kind) {
    throw new RxDBError(`${label} 的起止列类型不一致：'${range.from}' 是 ${from.kind}、'${range.to}' 是 ${to.kind}`);
  }
  return { from: from.column, to: to.column, bounds: range.bounds, kind: from.kind };
};

/** 同一列在一条排他声明里只能出现一次（相等列与区间端点合计）。 */
const assertDistinctColumns = (columns: readonly CompiledExclusionColumn[], subject: string): void => {
  const seen = new Set<string>();
  for (const { field, column } of columns) {
    if (seen.has(column)) {
      throw new RxDBError(`${subject} 的列 '${field}' 出现了不止一次：相等列与区间端点必须两两不同`);
    }
    seen.add(column);
  }
};

/** PG 侧区间维的范围类型。 */
const PG_RANGE_TYPE: Readonly<Record<ExclusionRangeKind, string>> = {
  timestamp: 'tstzrange',
  integer: 'int8range',
  bigint: 'int8range'
};

/**
 * PG 侧一维区间的 `EXCLUDE` 元素表达式。
 *
 * @remarks
 * 倒置区间以 `CASE` 映射成 `'empty'`：范围构造函数遇 `from > to` 抛 `22000`，
 * 而 SQLite 触发器把它当空区间放行——两后端都按空区间处理，错误类才不分叉。
 */
export const exclusionRangeExpressionPG = (range: CompiledExclusionRange): string => {
  const rangeType = PG_RANGE_TYPE[range.kind];
  const from = quoteSqlIdentifier(range.from.column);
  const to = quoteSqlIdentifier(range.to.column);
  return `(CASE WHEN ${from} > ${to} THEN 'empty'::${rangeType} ELSE ${rangeType}(${from}, ${to}, '${range.bounds}') END)`;
};

/**
 * 编译区间排他声明。
 *
 * @param metadata - `transitionMetadata()` 产出的实体元数据
 * @param exclusion - 区间排他声明
 * @returns 确定性约束名、相等列与区间维
 * @throws {@link RxDBError} 相等列 / 区间维为空、列不存在或类型不符、`bounds` 非法、
 *   同一列重复出现、`name` 不合 `[a-z][a-z0-9_]*` 或整名超 63 字节时（AC#15）
 */
export const compileExclusionConstraint = (
  metadata: EntityMetadata,
  exclusion: EntityExclusionMetadata
): CompiledExclusionConstraint => {
  const subject = `区间排他 ${exclusion.name}`;
  if (!Array.isArray(exclusion.equal) || exclusion.equal.length === 0) {
    throw new RxDBError(`${subject} 的 equal 至少一列：没有相等列的排他会把整表当成一组`);
  }
  if (!Array.isArray(exclusion.ranges) || exclusion.ranges.length === 0) {
    throw new RxDBError(`${subject} 的 ranges 至少一维`);
  }
  const equal = exclusion.equal.map(field => resolveEqualColumn(metadata, field, subject));
  const ranges = exclusion.ranges.map((range, index) =>
    compileRange(metadata, range, `${subject} 的第 ${index + 1} 维区间`)
  );
  assertDistinctColumns([...equal, ...ranges.flatMap(range => [range.from, range.to])], subject);
  const elements = [
    ...equal.map(column => `${quoteSqlIdentifier(column.column)} WITH =`),
    ...ranges.map(range => `${exclusionRangeExpressionPG(range)} WITH &&`)
  ];
  const definition = `${JSON.stringify([metadata.namespace, metadata.tableName])} EXCLUDE (${elements.join(', ')})`;
  return {
    name: storageConstraintName(EXCLUSION_NAME_PREFIX, metadata, exclusion.name, definition, '区间排他'),
    equal,
    ranges
  };
};

/**
 * SQLite 侧一条排他的两个触发器名：约束名加 `_i`（插入）/ `_u`（更新），仍以 `ex_` 起头、进漂移比对。
 */
export const exclusionTriggerNames = (constraintName: string): readonly [string, string] => [
  `${constraintName}_i`,
  `${constraintName}_u`
];

/**
 * 按约束名反查实体元数据里声明的区间排他（违约归一化用）。
 *
 * @returns 约束名匹配的编译结果；没声明过（或编译失败）时为 `undefined`
 */
export const findExclusionByConstraintName = (
  metadata: EntityMetadata,
  constraintName: string
): CompiledExclusionConstraint | undefined => {
  for (const exclusion of metadata.exclusionMap.values()) {
    try {
      const compiled = compileExclusionConstraint(metadata, exclusion);
      if (compiled.name === constraintName) return compiled;
    } catch {
      // 元数据在 init() 已校验过；这里兜底防的是调用方拿着未校验元数据直调
    }
  }
  return undefined;
};
