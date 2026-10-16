/**
 * @fileoverview 区间排他违约的识别与归一化（US-030 阶段 C）。
 *
 * 两后端归一为同一个错误类 {@link RxDBExclusionViolationError}：
 * - PostgreSQL：SQLSTATE `23P01`（`EXCLUDE USING gist`），约束名取错误对象的 `constraint`
 *   字段，再回退到消息文本 `violates exclusion constraint "…"`（worker 模式 / 错误再包装会丢
 *   字段，与 CHECK 的双重识别同口径）；双方区间取自 `DETAIL`；
 * - SQLite：排他触发器 `RAISE(ABORT, 'rxdb:exclusion_violation:<约束名>:' || <JSON>)`，
 *   JSON 是逐维的 `[本行起点, 本行终点, 已有行起点, 已有行终点]`（端点一律 `CAST(… AS TEXT)`，
 *   bigint 不过 JSON 数字、不丢精度）。部分绑定会在消息前回显整条 SQL，取**最后**一次匹配。
 *
 * 只有 `ex_` 起头且能反查到本实体声明的约束名才归一，其余原样上抛。双方区间解析不出来时
 * （PGlite worker 只回传消息文本、`DETAIL` 不在）`ranges` 为空，约束名仍然准确。
 *
 * 写入路径（仓储 create/update、批量 mutations、切换重放）统一调用
 * {@link toStorageConstraintViolationError}：先 CHECK、后排他，两类违约各归各的错误类。
 */

import {
  EXCLUSION_NAME_PREFIX,
  findExclusionByConstraintName,
  type CompiledExclusionConstraint,
  type CompiledExclusionRange
} from '../entity/exclusion-constraint.js';
import type { EntityMetadata } from '../entity/metadata.interface.js';
import { RxDBExclusionViolationError, type ExclusionRangeConflict } from '../RxDBError.js';
import { toCheckViolationErrorForRows } from './check-violation.js';

/** SQLite 排他触发器 `RAISE` 消息的前缀（PG 侧插件触发器也用同一格式 `rxdb:<kind>:<detail>`）。 */
export const EXCLUSION_VIOLATION_MESSAGE_PREFIX = 'rxdb:exclusion_violation:';

/** 识别出的区间排他违约：约束名，加上能拿到的冲突键原文。 */
export interface ParsedExclusionViolation {
  /** 约束名（`ex_` 起头才可能是元数据声明的） */
  readonly constraintName: string;
  /** PG 的 `DETAIL` 原文（`Key (…)=(…) conflicts with existing key (…)=(…).`） */
  readonly detail?: string;
  /** SQLite 触发器消息里的 JSON 载荷（逐维 `[本行起点, 本行终点, 已有行起点, 已有行终点]`） */
  readonly payload?: string;
}

const errorMessageOf = (cause: unknown): string => (cause instanceof Error ? cause.message : String(cause));

const stringFieldOf = (cause: unknown, field: string): string | undefined => {
  if (cause === null || typeof cause !== 'object') return undefined;
  const value = (cause as Record<string, unknown>)[field];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
};

const PG_EXCLUSION_VIOLATION_PATTERN = /violates exclusion constraint "([^"]+)"/i;

/**
 * 从 `start`（须指向 `[`）起截出一个括号配平的 JSON 数组原文，跳过字符串内的括号。
 *
 * @returns 数组原文；不配平时为 `undefined`
 */
const sliceJsonArray = (text: string, start: number): string | undefined => {
  if (text[start] !== '[') return undefined;
  let depth = 0;
  let inString = false;
  for (let index = start; index < text.length; index++) {
    const char = text[index];
    if (inString) {
      if (char === '\\') index += 1;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '[') depth += 1;
    else if (char === ']') {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  return undefined;
};

/** SQLite 触发器消息：取最后一次 `rxdb:exclusion_violation:` 出现。 */
const parseSqliteExclusionMessage = (message: string): ParsedExclusionViolation | undefined => {
  const start = message.lastIndexOf(EXCLUSION_VIOLATION_MESSAGE_PREFIX);
  if (start < 0) return undefined;
  const nameStart = start + EXCLUSION_VIOLATION_MESSAGE_PREFIX.length;
  const nameEnd = message.indexOf(':', nameStart);
  if (nameEnd <= nameStart) return undefined;
  return {
    constraintName: message.slice(nameStart, nameEnd),
    payload: sliceJsonArray(message, nameEnd + 1)
  };
};

/**
 * 从原始数据库错误里解析区间排他违约。
 *
 * @param cause - 适配器抛出的原始错误
 * @returns 约束名与冲突键原文；不是区间排他违约时为 `undefined`
 */
export const parseExclusionViolation = (cause: unknown): ParsedExclusionViolation | undefined => {
  const message = errorMessageOf(cause);
  const sqlite = parseSqliteExclusionMessage(message);
  if (sqlite) return sqlite;
  const isPgExclusion = stringFieldOf(cause, 'code') === '23P01';
  const constraintName =
    (isPgExclusion ? stringFieldOf(cause, 'constraint') : undefined) ??
    message.match(PG_EXCLUSION_VIOLATION_PATTERN)?.[1];
  if (!constraintName) return undefined;
  return { constraintName, detail: stringFieldOf(cause, 'detail') };
};

/** 一维区间两个端点的原文（`null` 即无界），与边界是否闭合。 */
interface RangeLiteral {
  readonly lower: string | null;
  readonly upper: string | null;
  readonly lowerInclusive: boolean;
  readonly upperInclusive: boolean;
}

/** PG 范围值的一个端点：双引号包裹（内部 `""` 转义）或不含分隔符的裸文本，空即无界。 */
const RANGE_BOUND_SOURCE = String.raw`(?:"(?:[^"]|"")*"|[^,"\[\]()]*)`;

/** PG 范围值的输出形态：`[a,b)` / `(,b]` / `["x","y")`；`empty` 不会出现在冲突键里，不认。 */
const RANGE_LITERAL_SOURCE = String.raw`[\[(]${RANGE_BOUND_SOURCE},${RANGE_BOUND_SOURCE}[\])]`;

const RANGE_LITERAL_PATTERN = new RegExp(String.raw`^([\[(])(${RANGE_BOUND_SOURCE}),(${RANGE_BOUND_SOURCE})([\])])$`);

const unquoteRangeBound = (bound: string): string | null => {
  if (bound === '') return null;
  return bound.startsWith('"') ? bound.slice(1, -1).replaceAll('""', '"') : bound;
};

const parseRangeLiteral = (literal: string): RangeLiteral | undefined => {
  const match = RANGE_LITERAL_PATTERN.exec(literal);
  if (!match) return undefined;
  return {
    lowerInclusive: match[1] === '[',
    lower: unquoteRangeBound(match[2]),
    upper: unquoteRangeBound(match[3]),
    upperInclusive: match[4] === ']'
  };
};

/**
 * 取 `Key (…)=(…)` 一侧值元组**末尾**的 `count` 个范围值。
 *
 * @remarks
 * 元组前段是相等列的值，PG 不加引号、以 `, ` 分隔——字符串值里可以有任何字符，从头切分不可靠；
 * 区间维恰好排在元组末尾、且范围值有固定形态，所以从末尾按形态锚定。
 */
const trailingRangeLiterals = (tuple: string, count: number): string[] | undefined => {
  const pattern = new RegExp(`(${RANGE_LITERAL_SOURCE})${`, (${RANGE_LITERAL_SOURCE})`.repeat(count - 1)}$`);
  const match = pattern.exec(tuple);
  return match ? match.slice(1, count + 1) : undefined;
};

const DETAIL_SEPARATOR = ' conflicts with existing key ';

/** PG `DETAIL` → 两侧（本行 / 已有行）的范围值。 */
const parsePgExclusionDetail = (
  detail: string,
  count: number
): { incoming: RangeLiteral[]; existing: RangeLiteral[] } | undefined => {
  const separator = detail.indexOf(DETAIL_SEPARATOR);
  if (separator < 0) return undefined;
  const incomingTuple = detail.slice(0, separator).replace(/\)$/, '');
  const existingTuple = detail
    .slice(separator + DETAIL_SEPARATOR.length)
    .trimEnd()
    .replace(/\)\.?$/, '');
  const incoming = trailingRangeLiterals(incomingTuple, count)?.map(parseRangeLiteral);
  const existing = trailingRangeLiterals(existingTuple, count)?.map(parseRangeLiteral);
  if (!incoming || !existing || [...incoming, ...existing].some(range => range === undefined)) return undefined;
  return { incoming: incoming as RangeLiteral[], existing: existing as RangeLiteral[] };
};

/** PG `timestamptz` 的文本输出（`2026-01-01 08:00:00+08`，时区随会话设置）→ `Date`。 */
const parsePgTimestamp = (text: string): Date | undefined => {
  const iso = text.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00');
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

const INTEGER_TEXT_PATTERN = /^-?\d+$/;

/**
 * 端点原文 → 声明值域的 JS 形态：时间类 `Date`、integer `number`、bigint `bigint`。
 *
 * @returns 解析不出来时为 `undefined`（由调用方整组放弃，不抛错——归一化不能把原始违约换成解析错误）
 */
const endpointValue = (range: CompiledExclusionRange, text: string | null): unknown => {
  if (text === null) return null;
  switch (range.kind) {
    case 'timestamp':
      // SQLite 存 ISO 文本（带 `T`），PG 输出 `YYYY-MM-DD HH:MM:SS±TZ`
      return text.includes('T') ? new Date(text) : parsePgTimestamp(text);
    case 'integer':
      return INTEGER_TEXT_PATTERN.test(text) ? Number(text) : undefined;
    case 'bigint':
      return INTEGER_TEXT_PATTERN.test(text) ? BigInt(text) : undefined;
  }
};

/**
 * PG 整数范围按 `[a,b)` 规范化输出，换回声明的边界：`[]` 维的终点是规范形态的上界减一。
 * 时间范围不做规范化，原样即声明边界。
 */
const declaredEndpoints = (range: CompiledExclusionRange, literal: RangeLiteral): readonly [unknown, unknown] => {
  const from = endpointValue(range, literal.lower);
  const to = endpointValue(range, literal.upper);
  if (range.kind === 'timestamp') return [from, to];
  const shift = (value: unknown, by: number): unknown =>
    typeof value === 'bigint' ? value + BigInt(by)
    : typeof value === 'number' ? value + by
    : value;
  const inclusiveFrom = literal.lowerInclusive ? from : shift(from, 1);
  const inclusiveTo = literal.upperInclusive ? to : shift(to, -1);
  return [inclusiveFrom, range.bounds === '[]' ? inclusiveTo : shift(inclusiveTo, 1)];
};

const isUnresolved = (value: unknown): boolean =>
  value === undefined || (value instanceof Date && Number.isNaN(value.getTime()));

/** SQLite 触发器载荷 → 逐维双方区间。 */
const conflictsFromSqlitePayload = (
  exclusion: CompiledExclusionConstraint,
  payload: string
): ExclusionRangeConflict[] | undefined => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return undefined;
  }
  const dimensions = parsed;
  if (!Array.isArray(dimensions) || dimensions.length !== exclusion.ranges.length) return undefined;
  if (!dimensions.every(entry => Array.isArray(entry) && entry.length === 4)) return undefined;
  return exclusion.ranges.map((range, index) => {
    const [incomingFrom, incomingTo, existingFrom, existingTo] = (dimensions[index] as unknown[]).map(text =>
      endpointValue(range, typeof text === 'string' ? text : null)
    );
    return {
      from: range.from.field,
      to: range.to.field,
      bounds: range.bounds,
      incoming: [incomingFrom, incomingTo] as const,
      existing: [existingFrom, existingTo] as const
    };
  });
};

/** PG `DETAIL` → 逐维双方区间。 */
const conflictsFromPgDetail = (
  exclusion: CompiledExclusionConstraint,
  detail: string
): ExclusionRangeConflict[] | undefined => {
  const literals = parsePgExclusionDetail(detail, exclusion.ranges.length);
  if (!literals) return undefined;
  return exclusion.ranges.map((range, index) => ({
    from: range.from.field,
    to: range.to.field,
    bounds: range.bounds,
    incoming: declaredEndpoints(range, literals.incoming[index]),
    existing: declaredEndpoints(range, literals.existing[index])
  }));
};

const exclusionConflictsOf = (
  exclusion: CompiledExclusionConstraint,
  parsed: ParsedExclusionViolation
): ExclusionRangeConflict[] => {
  const conflicts =
    parsed.payload !== undefined ? conflictsFromSqlitePayload(exclusion, parsed.payload)
    : parsed.detail !== undefined ? conflictsFromPgDetail(exclusion, parsed.detail)
    : undefined;
  if (!conflicts) return [];
  // 端点解析不出来（非预期的文本形态）时整组不报，不报半截区间
  const unresolved = conflicts.some(conflict => [...conflict.incoming, ...conflict.existing].some(isUnresolved));
  return unresolved ? [] : conflicts;
};

/**
 * 把区间排他违约的原始错误归一成 {@link RxDBExclusionViolationError}。
 *
 * @param cause - 适配器抛出的原始错误；不是本实体声明的区间排他违约时原样返回
 * @param metadata - 写入实体的元数据
 * @returns 归一后的错误，或原错误
 */
export const toExclusionViolationError = (cause: unknown, metadata: EntityMetadata): unknown => {
  const parsed = parseExclusionViolation(cause);
  if (!parsed || !parsed.constraintName.startsWith(EXCLUSION_NAME_PREFIX)) return cause;
  const exclusion = findExclusionByConstraintName(metadata, parsed.constraintName);
  if (!exclusion) return cause;
  return new RxDBExclusionViolationError(metadata.name, exclusion.name, exclusionConflictsOf(exclusion, parsed), cause);
};

/**
 * 写入路径的存储约束违约归一化：CHECK 归 {@link RxDBCheckViolationError}、区间排他归
 * {@link RxDBExclusionViolationError}，其余原样返回。
 *
 * @param cause - 适配器抛出的原始错误
 * @param metadata - 写入实体的元数据
 * @param rows - 适配器自己发出的行（CHECK 的冲突值只能取自它们，见 `toCheckViolationErrorForRows`）
 * @returns 归一后的错误，或原错误
 */
export const toStorageConstraintViolationError = (
  cause: unknown,
  metadata: EntityMetadata,
  rows: ReadonlyArray<Readonly<Record<string, unknown>>>
): unknown => {
  const check = toCheckViolationErrorForRows(cause, metadata, rows);
  return check !== cause ? check : toExclusionViolationError(cause, metadata);
};
