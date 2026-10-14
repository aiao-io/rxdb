/**
 * @fileoverview 区间排他违约的识别与归一化测试（US-030 阶段 C）。
 *
 * - SQLite：排他触发器 `rxdb:exclusion_violation:<约束名>:<JSON>`，取最后一次匹配（部分绑定回显整条 SQL）；
 * - PG：SQLSTATE `23P01` + `constraint` 字段 + `DETAIL`（多行表达式、随会话时区的时间文本、
 *   整数范围的 `[a,b)` 规范形态），worker 只回传消息文本时 `ranges` 为空；
 * - 只有能反查到本实体声明的 `ex_` 约束才归一；`toStorageConstraintViolationError` 先 CHECK 后排他。
 */

import { describe, expect, it } from 'vitest';
import { compileCheckConstraint } from '../../entity/check-constraint.js';
import { compileExclusionConstraint } from '../../entity/exclusion-constraint.js';
import { EntityMetadataOptions, PropertyType } from '../../entity/metadata-options.interface.js';
import { transitionMetadata } from '../../entity/metadata-transition.js';
import { RxDBCheckViolationError, RxDBExclusionViolationError } from '../../RxDBError.js';
import {
  EXCLUSION_VIOLATION_MESSAGE_PREFIX,
  parseExclusionViolation,
  toExclusionViolationError,
  toStorageConstraintViolationError
} from '../../system/exclusion-violation.js';

const metadata = transitionMetadata({
  name: 'Occurrence' as Capitalize<string>,
  namespace: 'public',
  properties: [
    { name: 'id', type: PropertyType.string, primary: true },
    { name: 'lineId', type: PropertyType.string },
    { name: 'flag', type: PropertyType.boolean, nullable: true },
    { name: 'effectiveFrom', type: PropertyType.date, nullable: true },
    { name: 'effectiveTo', type: PropertyType.date, nullable: true },
    { name: 'unitFrom', type: PropertyType.integer, nullable: true },
    { name: 'unitTo', type: PropertyType.integer, nullable: true },
    { name: 'serialFrom', type: PropertyType.bigint, nullable: true },
    { name: 'serialTo', type: PropertyType.bigint, nullable: true }
  ],
  checks: [
    { name: 'unit_order', rule: { combinator: 'and', rules: [{ field: 'unitFrom', operator: '<=', ref: 'unitTo' }] } }
  ],
  computedProperties: [],
  relations: [],
  indexes: [],
  exclusions: [
    {
      name: 'no_overlap',
      equal: ['lineId', 'flag'],
      ranges: [
        { from: 'effectiveFrom', to: 'effectiveTo', bounds: '[)' },
        { from: 'unitFrom', to: 'unitTo', bounds: '[]' }
      ]
    },
    {
      name: 'serial_no_overlap',
      equal: ['lineId'],
      ranges: [{ from: 'serialFrom', to: 'serialTo', bounds: '[]' }]
    }
  ]
} as EntityMetadataOptions);

const constraintName = compileExclusionConstraint(metadata, metadata.exclusionMap.get('no_overlap')!).name;
const serialConstraintName = compileExclusionConstraint(metadata, metadata.exclusionMap.get('serial_no_overlap')!).name;

/** PGlite 0.5.8 实测的 DETAIL 形态：表达式跨行、时间按会话时区（+08）输出、整数范围规范成 [a,b)。 */
const PG_DETAIL = `Key ("lineId", flag, (
CASE
    WHEN "effectiveFrom" > "effectiveTo" THEN 'empty'::tstzrange
    ELSE tstzrange("effectiveFrom", "effectiveTo", '[)'::text)
END), (
CASE
    WHEN "unitFrom" > "unitTo" THEN 'empty'::int8range
    ELSE int8range("unitFrom"::bigint, "unitTo"::bigint, '[]'::text)
END))=(L1, f, ["2026-01-15 08:00:00+08",), [120,201)) conflicts with existing key ("lineId", flag, (
CASE
    WHEN "effectiveFrom" > "effectiveTo" THEN 'empty'::tstzrange
    ELSE tstzrange("effectiveFrom", "effectiveTo", '[)'::text)
END), (
CASE
    WHEN "unitFrom" > "unitTo" THEN 'empty'::int8range
    ELSE int8range("unitFrom"::bigint, "unitTo"::bigint, '[]'::text)
END))=(L1, f, ["2026-01-01 08:00:00+08","2026-02-01 08:00:00+08"), [100,137)).`;

const pgError = (fields: Record<string, unknown>): Error =>
  Object.assign(new Error(`conflicting key value violates exclusion constraint "${constraintName}"`), fields);

describe('parseExclusionViolation', () => {
  it('SQLite：取最后一次 rxdb:exclusion_violation 出现（回显的 SQL 里有同名片段也不抢先）', () => {
    const payload = '[["2026-01-15T00:00:00.000Z",null,"2026-01-01T00:00:00.000Z","2026-02-01T00:00:00.000Z"]]';
    const message =
      `desktop database db failed for SQL "INSERT ... '${EXCLUSION_VIOLATION_MESSAGE_PREFIX}ex_fake:[]'": ` +
      `${EXCLUSION_VIOLATION_MESSAGE_PREFIX}${constraintName}:${payload}`;
    expect(parseExclusionViolation(new Error(message))).toEqual({ constraintName, payload });
  });

  it('PG：23P01 取 constraint 字段与 DETAIL', () => {
    expect(parseExclusionViolation(pgError({ code: '23P01', constraint: constraintName, detail: 'x' }))).toEqual({
      constraintName,
      detail: 'x'
    });
  });

  it('PG worker 只回传消息文本：约束名从消息里取，没有 DETAIL', () => {
    expect(parseExclusionViolation(new Error(`violates exclusion constraint "${constraintName}"`))).toEqual({
      constraintName,
      detail: undefined
    });
  });

  it('不是排他违约返回 undefined', () => {
    expect(parseExclusionViolation(new Error('UNIQUE constraint failed: t.id'))).toBeUndefined();
  });
});

describe('toExclusionViolationError', () => {
  it('SQLite 触发器载荷 → 双方区间（时间为 Date、整数为 number、NULL 端点即无界）', () => {
    const payload = JSON.stringify([
      ['2026-01-15T00:00:00.000Z', null, '2026-01-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z'],
      ['120', '200', '100', '136']
    ]);
    const cause = new Error(`${EXCLUSION_VIOLATION_MESSAGE_PREFIX}${constraintName}:${payload}`);
    const error = toExclusionViolationError(cause, metadata) as RxDBExclusionViolationError;
    expect(error).toBeInstanceOf(RxDBExclusionViolationError);
    expect(error.entity).toBe('Occurrence');
    expect(error.constraint).toBe(constraintName);
    expect(error.cause).toBe(cause);
    expect(error.ranges).toEqual([
      {
        from: 'effectiveFrom',
        to: 'effectiveTo',
        bounds: '[)',
        incoming: [new Date('2026-01-15T00:00:00.000Z'), null],
        existing: [new Date('2026-01-01T00:00:00.000Z'), new Date('2026-02-01T00:00:00.000Z')]
      },
      { from: 'unitFrom', to: 'unitTo', bounds: '[]', incoming: [120, 200], existing: [100, 136] }
    ]);
    expect(error.message).toContain(constraintName);
    expect(error.message).toContain('unitFrom..unitTo [120, 200] overlaps existing [100, 136]');
  });

  it('PG DETAIL → 与 SQLite 同形的双方区间：时区换算成同一时刻，整数 [] 维从 [a,b) 换回闭区间', () => {
    const error = toExclusionViolationError(
      pgError({ code: '23P01', constraint: constraintName, detail: PG_DETAIL }),
      metadata
    ) as RxDBExclusionViolationError;
    expect(error).toBeInstanceOf(RxDBExclusionViolationError);
    expect(error.ranges).toEqual([
      {
        from: 'effectiveFrom',
        to: 'effectiveTo',
        bounds: '[)',
        incoming: [new Date('2026-01-15T00:00:00.000Z'), null],
        existing: [new Date('2026-01-01T00:00:00.000Z'), new Date('2026-02-01T00:00:00.000Z')]
      },
      { from: 'unitFrom', to: 'unitTo', bounds: '[]', incoming: [120, 200], existing: [100, 136] }
    ]);
  });

  it('bigint 维的端点按 bigint 还原，不过 JSON 数字、不丢精度', () => {
    const big = '9007199254740993';
    const cause = new Error(
      `${EXCLUSION_VIOLATION_MESSAGE_PREFIX}${serialConstraintName}:${JSON.stringify([[big, null, '1', big]])}`
    );
    const error = toExclusionViolationError(cause, metadata) as RxDBExclusionViolationError;
    expect(error.ranges[0].incoming).toEqual([9007199254740993n, null]);
    expect(error.ranges[0].existing).toEqual([1n, 9007199254740993n]);
  });

  it('PG worker 只有消息文本：照样归一，ranges 为空、约束名准确', () => {
    const error = toExclusionViolationError(
      new Error(`conflicting key value violates exclusion constraint "${constraintName}"`),
      metadata
    ) as RxDBExclusionViolationError;
    expect(error).toBeInstanceOf(RxDBExclusionViolationError);
    expect(error.constraint).toBe(constraintName);
    expect(error.ranges).toEqual([]);
    expect(error.message).toContain('did not report the conflicting key');
  });

  it('载荷畸形时不抛解析错误，ranges 为空（归一化不能把原始违约换成别的错误）', () => {
    for (const payload of ['[[1,2', '[["x","y","z","w"],["a"]]', '[["not-a-date",null,null,null],["1","2","3","4"]]']) {
      const error = toExclusionViolationError(
        new Error(`${EXCLUSION_VIOLATION_MESSAGE_PREFIX}${constraintName}:${payload}`),
        metadata
      ) as RxDBExclusionViolationError;
      expect(error).toBeInstanceOf(RxDBExclusionViolationError);
      expect(error.ranges).toEqual([]);
    }
  });

  it('不是本实体声明的约束（或不以 ex_ 起头）原样返回', () => {
    const foreign = new Error(`${EXCLUSION_VIOLATION_MESSAGE_PREFIX}ex_Other_x_00000000:[]`);
    expect(toExclusionViolationError(foreign, metadata)).toBe(foreign);
    const unprefixed = new Error('conflicting key value violates exclusion constraint "manual_exclude"');
    expect(toExclusionViolationError(unprefixed, metadata)).toBe(unprefixed);
  });
});

describe('toStorageConstraintViolationError', () => {
  it('CHECK 违约归 RxDBCheckViolationError，排他违约归 RxDBExclusionViolationError，其余原样', () => {
    const checkName = compileCheckConstraint(metadata, metadata.checkMap.get('unit_order')!).name;
    const checkError = toStorageConstraintViolationError(
      Object.assign(new Error(`new row for relation "Occurrence" violates check constraint "${checkName}"`), {
        code: '23514'
      }),
      metadata,
      [{ unitFrom: 3, unitTo: 2 }]
    ) as RxDBCheckViolationError;
    expect(checkError).toBeInstanceOf(RxDBCheckViolationError);
    expect(checkError.constraint).toBe(checkName);

    const exclusion = toStorageConstraintViolationError(
      new Error(`${EXCLUSION_VIOLATION_MESSAGE_PREFIX}${constraintName}:[]`),
      metadata,
      []
    );
    expect(exclusion).toBeInstanceOf(RxDBExclusionViolationError);

    const other = new Error('disk I/O error');
    expect(toStorageConstraintViolationError(other, metadata, [])).toBe(other);
  });
});
