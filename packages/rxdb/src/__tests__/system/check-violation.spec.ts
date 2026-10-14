/**
 * @fileoverview CHECK 违约识别与归一化的单元测试（US-030 阶段 A 评审修复）。
 *
 * 覆盖：
 * - PG：SQLSTATE 23514 优先识别；worker / 再包装丢 SQLSTATE 时消息文本回退；
 * - SQLite：数据字面量里伪造的 `CHECK constraint failed:` 片段不能抢先命中，取最后匹配；
 * - 归一后错误挂原始 cause（仓库 cause 惯例）；
 * - 冲突值只上报行里存在的键：同步重放的增量 patch 不产生误导性的 undefined；
 * - 非 ck_ 约束与直连 SQL 违约保持原错误原样上抛。
 */

import { describe, expect, it } from 'vitest';
import { compileCheckConstraint } from '../../entity/check-constraint.js';
import { EntityMetadataOptions, PropertyType } from '../../entity/metadata-options.interface.js';
import { transitionMetadata } from '../../entity/metadata-transition.js';
import { RxDBCheckViolationError } from '../../RxDBError.js';
import {
  declaredCheckViolationOf,
  parseCheckConstraintViolation,
  toCheckViolationError,
  toCheckViolationErrorForRows
} from '../../system/check-violation.js';

const metadata = transitionMetadata({
  name: 'Violated' as Capitalize<string>,
  namespace: 'public',
  properties: [
    { name: 'qty', type: PropertyType.integer, nullable: true },
    { name: 'note', type: PropertyType.string, nullable: true }
  ],
  checks: [
    { name: 'qty_positive', rule: { combinator: 'and', rules: [{ field: 'qty', operator: '>', value: 0 }] } },
    { name: 'note_ne', rule: { combinator: 'and', rules: [{ field: 'note', operator: '!=', value: 'x' }] } }
  ],
  computedProperties: [],
  relations: [],
  indexes: []
} as EntityMetadataOptions);

const qtyName = compileCheckConstraint(metadata, metadata.checkMap.get('qty_positive')!).name;

describe('parseCheckConstraintViolation 识别口径', () => {
  it('PG：SQLSTATE 23514 识别并解析约束名', () => {
    const cause = Object.assign(new Error(`new row for relation "Violated" violates check constraint "${qtyName}"`), {
      code: '23514'
    });
    expect(parseCheckConstraintViolation(cause)).toEqual({ constraintName: qtyName });
  });

  it('PG：SQLSTATE 丢失（worker / 再包装）时按消息文本回退', () => {
    const cause = new Error(`new row for relation "Violated" violates check constraint "${qtyName}"`);
    expect(parseCheckConstraintViolation(cause)).toEqual({ constraintName: qtyName });
  });

  it('SQLite：数据字面量伪造的同名片段不能抢先命中，取最后匹配', () => {
    const cause = new Error(
      `Error executing: INSERT INTO "t" VALUES ('CHECK constraint failed: ck_fake_0badc0de', 1) ` +
        `CHECK constraint failed: ${qtyName}`
    );
    expect(parseCheckConstraintViolation(cause)).toEqual({ constraintName: qtyName });
  });

  it('非 CHECK 违约返回 undefined', () => {
    expect(parseCheckConstraintViolation(new Error('UNIQUE constraint failed: idx_x'))).toBeUndefined();
    expect(parseCheckConstraintViolation(new Error('no such table'))).toBeUndefined();
    expect(parseCheckConstraintViolation(Object.assign(new Error('whatever'), { code: '23505' }))).toBeUndefined();
  });
});

describe('toCheckViolationErrorForRows 归一化', () => {
  it('归一错误挂原始 cause，冲突值来自行', () => {
    const cause = Object.assign(new Error(`violates check constraint "${qtyName}"`), { code: '23514' });
    const normalized = toCheckViolationError(cause, metadata, { qty: -1, note: 'y' });
    expect(normalized).toBeInstanceOf(RxDBCheckViolationError);
    const violation = normalized as RxDBCheckViolationError;
    expect(violation.entity).toBe('Violated');
    expect(violation.constraint).toBe(qtyName);
    expect(violation.conflicts).toEqual([{ column: 'qty', value: -1 }]);
    expect(violation.cause).toBe(cause);
  });

  it('行里没有的键不上报（同步重放的增量 patch 不产生误导性 undefined）', () => {
    const cause = new Error(`CHECK constraint failed: ${qtyName}`);
    const normalized = toCheckViolationErrorForRows(cause, metadata, [{ note: 'y' }, { qty: -1 }]);
    const violation = normalized as RxDBCheckViolationError;
    expect(violation.conflicts).toEqual([{ column: 'qty', value: -1 }]);
    expect(violation.message).not.toContain('undefined');
  });

  it('非 ck_ 约束 / 直连 SQL 违约保持原错误原样上抛', () => {
    const anonymous = new Error(`CHECK constraint failed: Violated_qty_check`);
    expect(toCheckViolationError(anonymous, metadata, { qty: -1 })).toBe(anonymous);
    const undeclared = new Error('CHECK constraint failed: ck_Other_something_0badc0de');
    expect(toCheckViolationError(undeclared, metadata, { qty: -1 })).toBe(undeclared);
  });

  it('declaredCheckViolationOf 只认能反查到声明的 ck_ 约束', () => {
    expect(declaredCheckViolationOf(new Error(`CHECK constraint failed: ${qtyName}`), metadata)).toBe(qtyName);
    expect(
      declaredCheckViolationOf(new Error('CHECK constraint failed: ck_Other_x_0badc0de'), metadata)
    ).toBeUndefined();
  });
});
