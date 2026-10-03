/**
 * @fileoverview US-028 阶段 A — 可排序声明的继承与注册期校验（AC#1 前半、AC#10）。
 *
 * 1. `manualOrder` 是实体级行为，沿原型链就近继承，子类可显式关掉；整条链都没声明时不写这个键；
 * 2. 声明后 `sortOrder` 必须存在、为 string、可写、非计算、非空，违反报 `invalidManualOrder`（同字段多项并进一条消息）；
 * 3. 未声明但恰好有 `sortOrder` 字段的实体（含可空），校验结果不变（AC#10）。
 */

import { describe, expect, it } from 'vitest';
import type { EntityMetadataOptions } from '../../entity/entity-options.interface.js';
import { PropertyType } from '../../entity/metadata-options.interface.js';
import { transitionMetadata } from '../../entity/metadata-transition.js';
import { validateEntityMetadata } from '../../entity/metadata-validate.js';
import type { EntityPropertyMetadataOptions } from '../../entity/property-types.interface.js';

const SORT_ORDER: EntityPropertyMetadataOptions = { name: 'sortOrder', type: PropertyType.string };

const options = (overrides: Partial<EntityMetadataOptions> = {}): EntityMetadataOptions => ({
  name: 'Category',
  properties: [{ name: 'title', type: PropertyType.string }, SORT_ORDER],
  ...overrides
});

const ancestor = (overrides: Partial<EntityMetadataOptions> = {}): EntityMetadataOptions => ({
  name: 'Ancestor',
  properties: [],
  ...overrides
});

/** 只看可排序声明这一条规则，别的规则（如 sync）与本文件无关 */
const manualOrderViolations = (metadataOptions: EntityMetadataOptions) =>
  validateEntityMetadata(transitionMetadata(metadataOptions)).filter(error => error.rule === 'invalidManualOrder');

describe('manualOrder — 沿原型链就近继承', () => {
  it('整条链都没声明时不写这个键', () => {
    const meta = transitionMetadata(options());
    expect('manualOrder' in meta).toBe(false);
  });

  it('自身声明即生效', () => {
    expect(transitionMetadata(options({ manualOrder: true })).manualOrder).toBe(true);
  });

  it('继承祖先的声明', () => {
    const meta = transitionMetadata(options(), [ancestor({ manualOrder: true })]);
    expect(meta.manualOrder).toBe(true);
  });

  it('子类的 manualOrder: false 盖过祖先的 true', () => {
    const meta = transitionMetadata(options({ manualOrder: false }), [ancestor({ manualOrder: true })]);
    expect(meta.manualOrder).toBe(false);
  });
});

describe('manualOrder — invalidManualOrder 注册期校验', () => {
  it('合法声明不报错', () => {
    expect(manualOrderViolations(options({ manualOrder: true }))).toEqual([]);
  });

  it('sortOrder 字段缺失', () => {
    const violations = manualOrderViolations(
      options({ manualOrder: true, properties: [{ name: 'title', type: PropertyType.string }] })
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ field: 'sortOrder', entity: 'Category' });
    expect(violations[0].message).toContain('缺少');
  });

  it.each([
    ['非 string', { type: PropertyType.integer }, 'string'],
    ['不可写', { readonly: true }, 'readonly'],
    ['可为 NULL', { nullable: true }, 'nullable'],
    ['加密', { encrypted: true }, 'encrypted']
  ] as const)('sortOrder %s', (_label, patch, keyword) => {
    const violations = manualOrderViolations(
      options({ manualOrder: true, properties: [{ ...SORT_ORDER, ...patch } as EntityPropertyMetadataOptions] })
    );
    expect(violations).toHaveLength(1);
    expect(violations[0].field).toBe('sortOrder');
    expect(violations[0].message).toContain(keyword);
  });

  it('sortOrder 是计算字段', () => {
    const violations = manualOrderViolations(
      options({
        manualOrder: true,
        properties: [{ name: 'title', type: PropertyType.string }],
        computedProperties: [SORT_ORDER]
      })
    );
    expect(violations).toHaveLength(1);
    expect(violations[0].message).toContain('计算');
  });

  it('同一字段多处违规并进一条消息，逐项列出', () => {
    const violations = manualOrderViolations(
      options({
        manualOrder: true,
        properties: [{ name: 'sortOrder', type: PropertyType.integer, readonly: true, nullable: true }]
      })
    );
    expect(violations).toHaveLength(1);
    expect(violations[0].message).toContain('string');
    expect(violations[0].message).toContain('readonly');
    expect(violations[0].message).toContain('nullable');
  });

  it('manualOrder 不是布尔值', () => {
    const violations = manualOrderViolations(options({ manualOrder: 'yes' as never }));
    expect(violations).toHaveLength(1);
    expect(violations[0].field).toBe('manualOrder');
  });

  it('AC#10 未声明但恰好有可空 sortOrder 的实体不受影响', () => {
    expect(manualOrderViolations(options({ properties: [{ ...SORT_ORDER, nullable: true }] }))).toEqual([]);
    expect(manualOrderViolations(options({ manualOrder: false, properties: [] }))).toEqual([]);
  });
});
