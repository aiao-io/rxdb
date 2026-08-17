/**
 * @fileoverview US-012 阶段 A — `validateEntityMetadata()` 注册期校验（AC#4～6、AC#8～9、AC#11～12）。
 *
 * 结构 fixture（`STRUCTURAL_CASES`）与类型级测试共用同一份 `as const` 数据源，
 * 用于证明 AC#12 的单向不变式：类型拒绝则运行时拒绝。
 */

import { describe, expect, it } from 'vitest';
import {
  type EntityPropertyMetadata,
  type EntityRelationMetadata,
  PropertyType,
  RelationKind
} from '../../entity/metadata-options.interface.js';
import {
  FIELD_FORMAT_CARRIERS,
  FIELD_FORMAT_KINDS,
  type MetadataValidationRule,
  validateEntityMetadata
} from '../../entity/metadata-validate.js';
import type { EntityMetadata } from '../../entity/metadata.interface.js';
import { STRUCTURAL_CASES, VALUE_SEMANTIC_CASES } from '../fixtures/field-format-cases.js';

const makeMeta = (overrides: Partial<EntityMetadata> = {}): EntityMetadata =>
  ({
    name: 'Test',
    namespace: 'public',
    displayName: 'Test',
    tableName: 'test',
    repository: 'Repository',
    extends: [],
    properties: [],
    computedProperties: [],
    relations: [],
    indexes: [],
    propertyMap: new Map(),
    computedPropertyMap: new Map(),
    relationMap: new Map(),
    foreignKeyRelationMap: new Map(),
    foreignKeyRelations: [],
    foreignKeyNames: [],
    foreignKeyColumnNames: [],
    columnNameToPropertyName: new Map(),
    indexMap: new Map(),
    defaultValueProperties: [],
    isForeignKey: () => false,
    ...overrides
  }) as EntityMetadata;

/** 用单个属性构造实体元数据。 */
const withProperty = (property: Record<string, unknown>): EntityMetadata =>
  makeMeta({
    propertyMap: new Map([[String(property['name']), property as unknown as EntityPropertyMetadata]])
  });

/** 用单个关系构造实体元数据。 */
const withRelation = (relation: Record<string, unknown>): EntityMetadata =>
  makeMeta({
    relationMap: new Map([[String(relation['name']), relation as unknown as EntityRelationMetadata]])
  });

const rulesOf = (metadata: EntityMetadata): MetadataValidationRule[] =>
  validateEntityMetadata(metadata).map(error => error.rule);

/** `enum` / `options` 的合法载体：只有这两种 PropertyType 在类型层声明了这两个键。 */
const ENUM_CARRIER_TYPES = new Set<PropertyType>([PropertyType.enum, PropertyType.stringArray]);

/** 单值/多值冲突的 `kind:PropertyType` 组合，其余载体不匹配一律是 formatTypeMismatch。 */
const CARDINALITY_CONFLICT_PAIRS = new Set([
  `multiSelect:${PropertyType.enum}`,
  `singleSelect:${PropertyType.stringArray}`
]);

describe('validateEntityMetadata — 合法声明', () => {
  it('未声明 format 的字段零违规', () => {
    expect(validateEntityMetadata(withProperty({ name: 'title', type: PropertyType.string }))).toEqual([]);
  });

  it('每种 format 在其合法载体上都通过', () => {
    const legal = VALUE_SEMANTIC_CASES.filter(item => item.expected === null);
    expect(legal.length).toBeGreaterThan(0);
    legal.forEach(item => {
      expect(rulesOf(withProperty({ name: 'field', type: item.type, ...item.extra }))).toEqual([]);
    });
  });

  it('FIELD_FORMAT_KINDS 覆盖 16 项且与载体表同源', () => {
    expect(FIELD_FORMAT_KINDS).toHaveLength(16);
    expect(Object.keys(FIELD_FORMAT_CARRIERS)).toEqual([...FIELD_FORMAT_KINDS]);
  });
});

describe('validateEntityMetadata — AC#4 missingFormatConfig', () => {
  it.each([
    ['richText 缺 contentType', PropertyType.string, { kind: 'richText' }],
    ['currency 缺 currency', PropertyType.number, { kind: 'currency' }],
    ['percentage 缺 scale', PropertyType.number, { kind: 'percentage' }],
    ['duration 缺 unit', PropertyType.number, { kind: 'duration' }],
    ['rating 缺 min/max/step', PropertyType.number, { kind: 'rating' }]
  ])('%s', (_label, type, format) => {
    const errors = validateEntityMetadata(withProperty({ name: 'field', type, format }));
    expect(errors).toHaveLength(1);
    expect(errors[0].rule).toBe('missingFormatConfig');
    expect(errors[0].field).toBe('field');
  });

  it('rating 只缺 step 时也报 missingFormatConfig 并列出缺失键', () => {
    const errors = validateEntityMetadata(
      withProperty({ name: 'score', type: PropertyType.number, format: { kind: 'rating', min: 0, max: 5 } })
    );
    expect(errors[0].rule).toBe('missingFormatConfig');
    expect(errors[0].message).toContain('step');
  });
});

describe('validateEntityMetadata — AC#5 cardinalityConflict', () => {
  it('multiSelect 用在 enum 上', () => {
    const errors = validateEntityMetadata(
      withProperty({ name: 'tags', type: PropertyType.enum, enum: ['a'], format: { kind: 'multiSelect' } })
    );
    expect(errors.map(error => error.rule)).toContain('cardinalityConflict');
  });

  it('singleSelect 用在 stringArray 上', () => {
    const errors = validateEntityMetadata(
      withProperty({ name: 'tags', type: PropertyType.stringArray, enum: ['a'], format: { kind: 'singleSelect' } })
    );
    expect(errors.map(error => error.rule)).toContain('cardinalityConflict');
  });

  it('multiSelect 用在既非 enum 也非 stringArray 的载体上仍是 formatTypeMismatch', () => {
    expect(rulesOf(withProperty({ name: 'tags', type: PropertyType.string, format: { kind: 'multiSelect' } }))).toEqual(
      ['formatTypeMismatch']
    );
  });
});

describe('validateEntityMetadata — AC#6 invalidRange', () => {
  it.each([
    ['min > max', { kind: 'number', min: 10, max: 1 }],
    ['step <= 0', { kind: 'number', step: 0 }],
    ['非有限数', { kind: 'number', min: Number.POSITIVE_INFINITY }],
    ['NaN', { kind: 'number', max: Number.NaN }],
    ['rating 端点未对齐', { kind: 'rating', min: 0, max: 5, step: 2 }],
    ['rating min >= max', { kind: 'rating', min: 5, max: 5, step: 1 }],
    ['percentage 上界越出 0..1', { kind: 'percentage', scale: '0..1', max: 100 }],
    ['percentage 下界越出 0..100', { kind: 'percentage', scale: '0..100', min: -1 }]
  ])('%s', (_label, format) => {
    expect(rulesOf(withProperty({ name: 'amount', type: PropertyType.number, format }))).toEqual(['invalidRange']);
  });

  it('rating 端点可整除时通过', () => {
    expect(
      rulesOf(
        withProperty({
          name: 'score',
          type: PropertyType.number,
          format: { kind: 'rating', min: 0, max: 5, step: 0.5 }
        })
      )
    ).toEqual([]);
  });

  it('同一实体多个字段的违规一次全部报出', () => {
    const metadata = makeMeta({
      propertyMap: new Map([
        [
          'a',
          { name: 'a', type: PropertyType.number, format: { kind: 'currency' } } as unknown as EntityPropertyMetadata
        ],
        [
          'b',
          {
            name: 'b',
            type: PropertyType.number,
            format: { kind: 'number', min: 9, max: 1 }
          } as unknown as EntityPropertyMetadata
        ],
        ['c', { name: 'c', type: PropertyType.enum, enum: ['x', 'x'] } as unknown as EntityPropertyMetadata]
      ])
    });
    expect(validateEntityMetadata(metadata).map(error => [error.field, error.rule])).toEqual([
      ['a', 'missingFormatConfig'],
      ['b', 'invalidRange'],
      ['c', 'duplicateEnum']
    ]);
  });
});

describe('validateEntityMetadata — AC#8/AC#9 enum 与 options', () => {
  it('stringArray 声明 multiSelect 但缺 enum → missingEnum', () => {
    expect(
      rulesOf(withProperty({ name: 'tags', type: PropertyType.stringArray, format: { kind: 'multiSelect' } }))
    ).toEqual(['missingEnum']);
  });

  it('stringArray 声明 options 但缺 enum → missingEnum', () => {
    expect(rulesOf(withProperty({ name: 'tags', type: PropertyType.stringArray, options: {} }))).toEqual([
      'missingEnum'
    ]);
  });

  it('EnumProperty 缺 enum → missingEnum', () => {
    expect(rulesOf(withProperty({ name: 'state', type: PropertyType.enum }))).toEqual(['missingEnum']);
  });

  it('EnumProperty 空 enum → missingEnum', () => {
    expect(rulesOf(withProperty({ name: 'state', type: PropertyType.enum, enum: [] }))).toEqual(['missingEnum']);
  });

  it('stringArray 只声明 enum、不声明 multiSelect/options 时不要求 enum 非空', () => {
    expect(rulesOf(withProperty({ name: 'tags', type: PropertyType.stringArray, enum: [] }))).toEqual([]);
  });

  it('options 键越界 → enumOptionsMismatch 并列出全部越界键', () => {
    const errors = validateEntityMetadata(
      withProperty({
        name: 'state',
        type: PropertyType.enum,
        enum: ['open'],
        options: { open: { label: '打开' }, closed: {}, archived: {} }
      })
    );
    expect(errors).toHaveLength(1);
    expect(errors[0].rule).toBe('enumOptionsMismatch');
    expect(errors[0].message).toContain('closed');
    expect(errors[0].message).toContain('archived');
  });

  it('enum 重复 → duplicateEnum 并指出字段名与重复值', () => {
    const errors = validateEntityMetadata(
      withProperty({ name: 'state', type: PropertyType.enum, enum: ['a', 'b', 'a', 'b'] })
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ field: 'state', rule: 'duplicateEnum' });
    expect(errors[0].message).toContain('"a"');
    expect(errors[0].message).toContain('"b"');
  });

  it('scheme 大小写重复 → invalidFormatConfig 并指出重复项（US-019 AC#1）', () => {
    const errors = validateEntityMetadata(
      withProperty({ name: 'homepage', type: PropertyType.string, format: { kind: 'url', schemes: ['HTTP', 'http'] } })
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ field: 'homepage', rule: 'invalidFormatConfig' });
    // 报的是判重口径下的小写形式，作者据此能定位到底哪两项撞了
    expect(errors[0].message).toContain('"http"');
  });

  it('scheme 语法非法时不再判定大小写重复（US-019 AC#2）', () => {
    // 两项同时犯规：语法更具体，且同一 format 只产出一条错误
    const errors = validateEntityMetadata(
      withProperty({
        name: 'homepage',
        type: PropertyType.string,
        format: { kind: 'url', schemes: ['1http', 'HTTP', 'http'] }
      })
    );
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('1http');
    expect(errors[0].message).not.toContain('重复');
  });

  it('enum 非法时不再判定重复值与 options 子集', () => {
    expect(rulesOf(withProperty({ name: 'state', type: PropertyType.enum, enum: 'open', options: { x: {} } }))).toEqual(
      ['invalidEnumConfig']
    );
  });

  it('options 非法时不再判定键越界', () => {
    expect(
      rulesOf(withProperty({ name: 'state', type: PropertyType.enum, enum: ['a'], options: { a: { label: 1 } } }))
    ).toEqual(['invalidOptionsConfig']);
  });

  it('options 出现未知展示键 → invalidOptionsConfig', () => {
    expect(
      rulesOf(withProperty({ name: 'state', type: PropertyType.enum, enum: ['a'], options: { a: { icon: 'x' } } }))
    ).toEqual(['invalidOptionsConfig']);
  });

  // 以下三例守的是「载体」这道闸：类型层只有 EnumProperty 与 StringArrayProperty 声明 enum / options，
  // 绕过 TypeScript 后一个 number 属性带上 enum 会一路进到描述器，validateFieldValue() 还会拿数字去比枚举成员。
  // 断言必须落到 message：invalidEnumConfig 同时由「enum 必须是字符串数组」产出，只看 rule 证明不了是闸在拦。
  it.each([[PropertyType.string], [PropertyType.integer], [PropertyType.boolean], [PropertyType.json]])(
    '%s 属性带 enum → invalidEnumConfig 且指明合法载体',
    type => {
      const errors = validateEntityMetadata(withProperty({ name: 'field', type, enum: ['a'] }));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatchObject({ field: 'field', rule: 'invalidEnumConfig' });
      expect(errors[0].message).toContain('只能声明在');
    }
  );

  it.each([[PropertyType.string], [PropertyType.integer], [PropertyType.boolean], [PropertyType.json]])(
    '%s 属性带 options → invalidOptionsConfig 且指明合法载体',
    type => {
      const errors = validateEntityMetadata(withProperty({ name: 'field', type, options: { a: {} } }));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatchObject({ field: 'field', rule: 'invalidOptionsConfig' });
      expect(errors[0].message).toContain('只能声明在');
    }
  );

  it('非载体同时带 enum 与 options → 两条独立违规', () => {
    // 两个 if 是平行的而不是 else-if：改成互斥会让第二个键静默过闸
    expect(rulesOf(withProperty({ name: 'field', type: PropertyType.json, enum: ['a'], options: { a: {} } }))).toEqual([
      'invalidEnumConfig',
      'invalidOptionsConfig'
    ]);
  });

  it('非载体不带 enum / options 时不产出载体违规', () => {
    expect(rulesOf(withProperty({ name: 'field', type: PropertyType.string }))).toEqual([]);
  });

  it('enum 与 format 族规则可同时产出', () => {
    expect(
      rulesOf(
        withProperty({
          name: 'state',
          type: PropertyType.enum,
          enum: ['a', 'a'],
          format: { kind: 'multiSelect' }
        })
      )
    ).toEqual(['cardinalityConflict', 'duplicateEnum']);
  });
});

describe('validateEntityMetadata — AC#10 关系', () => {
  const relation = (extra: Record<string, unknown>): Record<string, unknown> => ({
    name: 'order',
    kind: RelationKind.MANY_TO_ONE,
    mappedEntity: 'Order',
    mappedProperty: 'items',
    mappedNamespace: 'public',
    ...extra
  });

  it.each([RelationKind.ONE_TO_ONE, RelationKind.ONE_TO_MANY, RelationKind.MANY_TO_ONE, RelationKind.MANY_TO_MANY])(
    '%s 关系声明 format → formatOnRelation',
    kind => {
      const errors = validateEntityMetadata(withRelation(relation({ kind, format: { kind: 'plainText' } })));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatchObject({ field: 'order', rule: 'formatOnRelation' });
    }
  );

  it.each([RelationKind.ONE_TO_ONE, RelationKind.ONE_TO_MANY, RelationKind.MANY_TO_ONE, RelationKind.MANY_TO_MANY])(
    '%s 关系声明 readonly → readonlyOnRelation',
    kind => {
      const errors = validateEntityMetadata(withRelation(relation({ kind, readonly: false })));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatchObject({ field: 'order', rule: 'readonlyOnRelation' });
    }
  );

  it('format 与 readonly 同时出现时两条都报', () => {
    expect(rulesOf(withRelation(relation({ format: { kind: 'url' }, readonly: true })))).toEqual([
      'formatOnRelation',
      'readonlyOnRelation'
    ]);
  });

  it('关系上的畸形 format 先报形状错误', () => {
    expect(rulesOf(withRelation(relation({ format: null })))).toEqual(['invalidFormatConfig']);
  });
});

describe('validateEntityMetadata — AC#11 畸形输入不崩溃', () => {
  it.each([
    ['format: null', { format: null }, 'invalidFormatConfig'],
    ['format 是数组', { format: [] }, 'invalidFormatConfig'],
    ['format 是字符串', { format: 'url' }, 'invalidFormatConfig'],
    ['format 缺 kind', { format: {} }, 'invalidFormatConfig'],
    ['format.kind 非字符串', { format: { kind: 7 } }, 'invalidFormatConfig'],
    ['未知 kind', { format: { kind: 'bogus' } }, 'unknownFormat']
  ])('%s → %s', (_label, extra, rule) => {
    expect(rulesOf(withProperty({ name: 'field', type: PropertyType.string, ...extra }))).toEqual([rule]);
  });

  // 直接索引规则表时，这些名字会取到原型链上的成员：`allowed` 恒为真值绕过 unknownFormat，
  // 随后拿 `Object.prototype.toString` 当数组做 `.includes()` 抛 TypeError，整个聚合过程中断
  it.each([['__proto__'], ['constructor'], ['toString'], ['valueOf'], ['hasOwnProperty']])(
    'format.kind 为原型链名 %s → unknownFormat 而不是抛错',
    kind => {
      expect(rulesOf(withProperty({ name: 'field', type: PropertyType.string, format: { kind } }))).toEqual([
        'unknownFormat'
      ]);
    }
  );

  it.each([
    ['options 是 Map', new Map()],
    ['options 是 Date', new Date()],
    ['options 是类实例', new (class Holder {})()]
  ])('%s → invalidOptionsConfig', (_label, options) => {
    // 这些对象的 Object.entries() 都是空数组，只判「非数组非 null」会让它们一路进到本该 JSON-safe 的 DTO
    expect(rulesOf(withProperty({ name: 'state', type: PropertyType.enum, enum: ['a'], options }))).toEqual([
      'invalidOptionsConfig'
    ]);
  });

  it('format 是类实例 → invalidFormatConfig', () => {
    expect(rulesOf(withProperty({ name: 'field', type: PropertyType.string, format: new Date() }))).toEqual([
      'invalidFormatConfig'
    ]);
  });

  it('未知 kind 放在不匹配的载体上仍报 unknownFormat', () => {
    expect(rulesOf(withProperty({ name: 'flag', type: PropertyType.boolean, format: { kind: 'bogus' } }))).toEqual([
      'unknownFormat'
    ]);
  });

  it.each([
    ['非数组 enum', { type: PropertyType.enum, enum: {} }],
    ['enum 含非字符串', { type: PropertyType.enum, enum: ['a', 1] }]
  ])('%s → invalidEnumConfig', (_label, extra) => {
    expect(rulesOf(withProperty({ name: 'field', ...extra }))).toEqual(['invalidEnumConfig']);
  });

  it.each([
    ['options 是数组', []],
    ['options 是字符串', 'x'],
    ['options 展示项非对象', { a: 1 }]
  ])('%s → invalidOptionsConfig', (_label, options) => {
    expect(rulesOf(withProperty({ name: 'state', type: PropertyType.enum, enum: ['a'], options }))).toEqual([
      'invalidOptionsConfig'
    ]);
  });

  it('计算属性同样参与校验', () => {
    const metadata = makeMeta({
      computedPropertyMap: new Map([
        [
          'total',
          {
            name: 'total',
            type: PropertyType.number,
            format: { kind: 'currency' }
          } as unknown as EntityPropertyMetadata
        ]
      ])
    });
    expect(rulesOf(metadata)).toEqual(['missingFormatConfig']);
  });

  it('违规按 namespace/entity/field/rule 稳定排序', () => {
    const metadata = makeMeta({
      namespace: 'shop',
      name: 'Order',
      propertyMap: new Map([
        ['zeta', { name: 'zeta', type: PropertyType.string, format: null } as unknown as EntityPropertyMetadata],
        ['alpha', { name: 'alpha', type: PropertyType.enum } as unknown as EntityPropertyMetadata]
      ])
    });
    expect(validateEntityMetadata(metadata)).toEqual([
      expect.objectContaining({ namespace: 'shop', entity: 'Order', field: 'alpha', rule: 'missingEnum' }),
      expect.objectContaining({ namespace: 'shop', entity: 'Order', field: 'zeta', rule: 'invalidFormatConfig' })
    ]);
  });
});

describe('validateEntityMetadata — AC#12 结构 fixture 单向不变式', () => {
  it('类型层拒绝的结构组合，运行时一律拒绝', () => {
    STRUCTURAL_CASES.filter(item => item.typeRejects).forEach(item => {
      const rules = rulesOf(withProperty({ name: 'field', type: item.type, ...item.extra }));
      expect(rules, `${item.label} 必须被运行时拒绝`).toContain(item.expected);
    });
  });

  it('类型层接受的结构组合，运行时一律接受', () => {
    STRUCTURAL_CASES.filter(item => !item.typeRejects).forEach(item => {
      expect(rulesOf(withProperty({ name: 'field', type: item.type, ...item.extra })), item.label).toEqual([]);
    });
  });

  it('载体表覆盖每个 kind × 每个非法 PropertyType 都产出结构违规', () => {
    const carriers = FIELD_FORMAT_CARRIERS as Record<string, readonly PropertyType[]>;
    const scalarTypes = [
      PropertyType.string,
      PropertyType.number,
      PropertyType.integer,
      PropertyType.date,
      PropertyType.enum,
      PropertyType.stringArray,
      PropertyType.boolean
    ];
    FIELD_FORMAT_KINDS.forEach(kind => {
      scalarTypes
        .filter(type => !carriers[kind].includes(type))
        .forEach(type => {
          // 只给 enum/stringArray 载体带上合法 enum，隔离 enum 族规则，只观察 format 族结论。
          // 其余类型不能带 enum：它们在类型层就没有这个键，带上会另报 invalidEnumConfig
          const enumKey = ENUM_CARRIER_TYPES.has(type) ? { enum: ['a'] } : {};
          const rules = rulesOf(withProperty({ name: 'field', type, ...enumKey, format: { kind } }));
          expect(rules, `${kind} on ${type}`).toEqual([
            CARDINALITY_CONFLICT_PAIRS.has(`${kind}:${type}`) ? 'cardinalityConflict' : 'formatTypeMismatch'
          ]);
        });
    });
  });

  it('值语义 fixture 只能由运行时拒绝', () => {
    VALUE_SEMANTIC_CASES.forEach(item => {
      const rules = rulesOf(withProperty({ name: 'field', type: item.type, ...item.extra }));
      expect(rules, item.label).toEqual(item.expected === null ? [] : [item.expected]);
    });
  });
});
