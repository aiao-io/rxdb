/**
 * 实体级 CHECK 按 name 继承，只被同名约束覆盖（US-030 AC#17）。
 *
 * 子实体重声明一个属性（不带 `check`）只摘除**继承来的属性级语法糖**；父类显式声明、
 * 恰好与字段同名的实体级 CHECK 不是语法糖，必须留下——否则子类建表时整条约束消失、注册期零违规。
 */
import { describe, expect, it } from 'vitest';
import { compileCheckExpression } from '../../entity/check-constraint.js';
import { EntityMetadataOptions, IntegerProperty, PropertyType } from '../../entity/metadata-options.interface.js';
import { transitionMetadata } from '../../entity/metadata-transition.js';
import { validateEntityMetadata } from '../../entity/metadata-validate.js';

const intProp = (name: string, extra: Partial<IntegerProperty> = {}): IntegerProperty =>
  ({ name: name as Uncapitalize<string>, type: PropertyType.integer, ...extra }) as IntegerProperty;

const optionsOf = (name: string, overrides: Partial<EntityMetadataOptions>): EntityMetadataOptions =>
  ({
    name: name as Capitalize<string>,
    namespace: 'public',
    properties: [],
    computedProperties: [],
    relations: [],
    indexes: [],
    ...overrides
  }) as EntityMetadataOptions;

const qtyPositive = { name: 'qty', rule: { combinator: 'and', rules: [{ field: 'qty', operator: '>', value: 0 }] } };

describe('CHECK 继承：重声明字段只摘语法糖', () => {
  it('父类显式声明、与字段同名的 CHECK 在子类重声明该字段后仍在', () => {
    const parent = optionsOf('Parent', {
      properties: [intProp('id', { primary: true }), intProp('qty', { nullable: true })],
      checks: [qtyPositive] as EntityMetadataOptions['checks']
    });
    const child = transitionMetadata(
      optionsOf('Child', {
        extends: ['Parent'],
        properties: [intProp('qty', { nullable: true, displayName: '数量' })]
      }),
      [parent]
    );

    expect([...child.checkMap.keys()]).toEqual(['qty']);
    expect(compileCheckExpression(child, child.checkMap.get('qty')!)).toBe('("qty" > 0)');
    expect(validateEntityMetadata(child)).toEqual([]);
  });

  it('继承来的属性级语法糖照旧被摘除', () => {
    const parent = optionsOf('Parent', {
      properties: [intProp('id', { primary: true }), intProp('qty', { nullable: true, check: { operator: '>', value: 0 } })]
    });
    const child = transitionMetadata(
      optionsOf('Child', { extends: ['Parent'], properties: [intProp('qty', { nullable: true })] }),
      [parent]
    );

    expect(child.checkMap.size).toBe(0);
  });

  it('三层继承：中间层显式覆盖了祖先的语法糖，孙类重声明字段后显式约束仍在', () => {
    const grandparent = optionsOf('Grandparent', {
      properties: [intProp('id', { primary: true }), intProp('qty', { nullable: true, check: { operator: '>', value: 5 } })]
    });
    const parent = optionsOf('Parent', {
      extends: ['Grandparent'],
      checks: [qtyPositive] as EntityMetadataOptions['checks']
    });
    const child = transitionMetadata(
      optionsOf('Child', {
        extends: ['Parent', 'Grandparent'],
        properties: [intProp('qty', { nullable: true, displayName: '数量' })]
      }),
      [parent, grandparent]
    );

    expect([...child.checkMap.keys()]).toEqual(['qty']);
    expect(compileCheckExpression(child, child.checkMap.get('qty')!)).toBe('("qty" > 0)');
  });

  it('子类自己的属性级语法糖照旧覆盖父类同名显式约束', () => {
    const parent = optionsOf('Parent', {
      properties: [intProp('id', { primary: true }), intProp('qty', { nullable: true })],
      checks: [qtyPositive] as EntityMetadataOptions['checks']
    });
    const child = transitionMetadata(
      optionsOf('Child', {
        extends: ['Parent'],
        properties: [intProp('qty', { nullable: true, check: { operator: '>=', value: 10 } })]
      }),
      [parent]
    );

    expect(compileCheckExpression(child, child.checkMap.get('qty')!)).toBe('("qty" >= 10)');
  });
});
