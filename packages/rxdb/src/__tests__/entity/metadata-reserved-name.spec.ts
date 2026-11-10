/**
 * `__proto__` 不能作属性名、关系名或物理列名。
 *
 * 写入链路上的每一层（`normalizeCreateEntity` / `normalizeUpdateEntity`、适配器的值转换、实体实例本身）
 * 都按「对象键」读写字段；`__proto__` 是 `Object.prototype` 上的访问器，按键赋值会被它吞掉
 * （字符串值静默丢弃，INSERT 少一列、UPDATE 报空补丁）或改写原型。注册期就拒绝，而不是让它静默丢数据。
 */
import { describe, expect, it } from 'vitest';
import { normalizeCreateEntity, normalizeUpdateEntity } from '../../entity/entity.utils.js';
import { EntityMetadataOptions, PropertyType } from '../../entity/metadata-options.interface.js';
import { transitionMetadata } from '../../entity/metadata-transition.js';
import { validateEntityMetadata } from '../../entity/metadata-validate.js';
import { OnDeleteAction, RelationKind } from '../../entity/relation-types.interface.js';

const metadataOf = (overrides: Partial<EntityMetadataOptions>): ReturnType<typeof transitionMetadata> =>
  transitionMetadata({
    name: 'Row' as Capitalize<string>,
    namespace: 'public',
    properties: [{ name: 'id', type: PropertyType.string, primary: true }],
    computedProperties: [],
    relations: [],
    indexes: [],
    ...overrides
  } as EntityMetadataOptions);

const violationsOf = (overrides: Partial<EntityMetadataOptions>) =>
  validateEntityMetadata(metadataOf(overrides)).map(({ field, rule }) => ({ field, rule }));

describe('reservedName：__proto__ 不能作字段键', () => {
  it('属性的物理列名是 __proto__ 时注册期拒绝', () => {
    const violations = violationsOf({
      properties: [
        { name: 'id', type: PropertyType.string, primary: true },
        { name: 'label' as Uncapitalize<string>, type: PropertyType.string, columnName: '__proto__', nullable: true }
      ]
    });
    expect(violations).toEqual([{ field: 'label', rule: 'reservedName' }]);
  });

  it('属性名本身是 __proto__ 时注册期拒绝', () => {
    const violations = violationsOf({
      properties: [
        { name: 'id', type: PropertyType.string, primary: true },
        { name: '__proto__' as Uncapitalize<string>, type: PropertyType.string, columnName: 'proto_value' }
      ]
    });
    expect(violations).toEqual([{ field: '__proto__', rule: 'reservedName' }]);
  });

  it('关系名或外键列名是 __proto__ 时注册期拒绝', () => {
    const relation = {
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'Row',
      mappedProperty: 'id',
      nullable: true,
      onDelete: OnDeleteAction.CASCADE,
      onUpdate: OnDeleteAction.CASCADE
    };
    expect(violationsOf({ relations: [{ ...relation, name: 'parent', columnName: '__proto__' }] as never })).toEqual([
      { field: 'parent', rule: 'reservedName' }
    ]);
    expect(violationsOf({ relations: [{ ...relation, name: '__proto__', columnName: 'parentId' }] as never })).toEqual([
      { field: '__proto__', rule: 'reservedName' }
    ]);
  });

  it('constructor / toString 这类普通键照常可用，归一化后是自有数据键', () => {
    const options: Partial<EntityMetadataOptions> = {
      properties: [
        { name: 'id', type: PropertyType.string, primary: true },
        { name: 'kind' as Uncapitalize<string>, type: PropertyType.string, columnName: 'constructor', nullable: true },
        { name: 'label' as Uncapitalize<string>, type: PropertyType.string, columnName: 'toString', nullable: true }
      ]
    };
    expect(violationsOf(options)).toEqual([]);

    const metadata = metadataOf(options);
    const created = normalizeCreateEntity(metadata, { id: 'row', kind: 'k', label: 'l' });
    expect(Object.getOwnPropertyDescriptor(created, 'constructor')?.value).toBe('k');
    expect(Object.getOwnPropertyDescriptor(created, 'toString')?.value).toBe('l');
    expect(normalizeUpdateEntity(metadata, { label: 'next' })).toEqual({ toString: 'next' });
  });
});
