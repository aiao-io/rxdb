/**
 * @fileoverview US-519 扩展属性纯函数面测试：写入校验与过滤 SQL 生成。
 *
 * 覆盖 AC#1（枚举拒绝 + 点名）、AC#2（作用域越界）、AC#4（双后端 SQL 生成、
 * 缺字段 / null 语义、类型不符拒绝）、AC#5（三种写入模式）、AC#6（同 code 跨作用域）。
 * AC#3 / #7（generated column / GIN 索引）不在本步范围。
 */

import { describe, expect, it } from 'vitest';
import {
  BomExtAttrError,
  buildExtFilterSql,
  normalizeExtValue,
  validateExtWrite,
  type ExtAttrDefShape,
  type ExtFilter
} from '../resolve/ext-attr.js';

/** 构造一条 attr_def 声明（appliesTo 默认 item）。 */
const attrDef = (code: string, dataType: string, overrides: Partial<ExtAttrDefShape> = {}): ExtAttrDefShape => ({
  code,
  dataType,
  required: false,
  enumValues: null,
  appliesTo: 'item',
  ...overrides
});

describe('normalizeExtValue', () => {
  it('对象序列化为规范 JSON：键序稳定（递归按码点排序）', () => {
    expect(normalizeExtValue({ b: 2, a: { d: 4, c: 3 } })).toBe('{"a":{"c":3,"d":4},"b":2}');
    expect(normalizeExtValue({ a: { d: 4, c: 3 }, b: 2 })).toBe('{"a":{"c":3,"d":4},"b":2}');
  });

  it('字符串输入：合法 JSON 对象规范化；非法 JSON 抛错', () => {
    expect(normalizeExtValue('{"b":1,"a":2}')).toBe('{"a":2,"b":1}');
    expect(() => normalizeExtValue('not json')).toThrowError(BomExtAttrError);
    expect(() => normalizeExtValue('"scalar"')).toThrowError(BomExtAttrError);
  });

  it('非对象输入拒绝：null / 数组 / 数字', () => {
    expect(() => normalizeExtValue(null)).toThrowError(BomExtAttrError);
    expect(() => normalizeExtValue([1, 2])).toThrowError(BomExtAttrError);
    expect(() => normalizeExtValue(42)).toThrowError(BomExtAttrError);
  });

  it('undefined 值视为缺字段跳过；函数 / Date / 非有限数值拒绝', () => {
    expect(normalizeExtValue({ a: 1, b: undefined })).toBe('{"a":1}');
    expect(() => normalizeExtValue({ a: () => 1 })).toThrowError(BomExtAttrError);
    expect(() => normalizeExtValue({ a: new Date() })).toThrowError(BomExtAttrError);
    expect(() => normalizeExtValue({ a: Number.NaN })).toThrowError(BomExtAttrError);
  });
});

describe('validateExtWrite', () => {
  it('AC#1：枚举违约拒绝并点名字段与合法取值', () => {
    const defs = [attrDef('rohs', 'string', { required: true, enumValues: ['yes', 'no'] })];
    expect(() => validateExtWrite(defs, 'item', { rohs: 'maybe' }, 'create')).toThrowError(BomExtAttrError);
    try {
      validateExtWrite(defs, 'item', { rohs: 'maybe' }, 'create');
      expect.unreachable('应抛出 BomExtAttrError');
    } catch (error) {
      const e = error as BomExtAttrError;
      expect(e).toBeInstanceOf(BomExtAttrError);
      expect(e.subject).toBe('rohs');
      expect(e.message).toContain('yes');
      expect(e.message).toContain('no');
    }
    expect(() => validateExtWrite(defs, 'item', { rohs: 'yes' }, 'create')).not.toThrow();
  });

  it('AC#2：applies_to 作用域越界拒绝（点名未声明的 key）', () => {
    const defs = [attrDef('rohs', 'string')]; // appliesTo = 'item'
    expect(() => validateExtWrite(defs, 'item', { rohs: 'yes', rohsStatus: 'x' }, 'create')).toThrowError(/rohsStatus/);
    // 对 bom_line_occurrence 而言 rohs 未声明：越界，而不是枚举 / 类型违约
    expect(() => validateExtWrite(defs, 'bom_line_occurrence', { rohs: 'yes' }, 'create')).toThrowError(/rohs/);
  });

  it('AC#5：create / update-complete 缺必填或 null 拒绝并点名；update-partial 不强制', () => {
    const defs = [attrDef('rohs', 'string', { required: true, enumValues: ['yes', 'no'] })];
    // ③ 新写入 / 完整更新不带必填字段：拒绝，点名缺失字段
    expect(() => validateExtWrite(defs, 'item', {}, 'create')).toThrowError(/rohs/);
    expect(() => validateExtWrite(defs, 'item', { rohs: null }, 'create')).toThrowError(/rohs/);
    expect(() => validateExtWrite(defs, 'item', {}, 'update-complete')).toThrowError(/rohs/);
    // ② 局部更新不触碰扩展属性（ext 为空或显式 null）不强制补齐
    expect(() => validateExtWrite(defs, 'item', {}, 'update-partial')).not.toThrow();
    expect(() => validateExtWrite(defs, 'item', { rohs: null }, 'update-partial')).not.toThrow();
    // partial 触碰到的 key 仍照常校验枚举
    expect(() => validateExtWrite(defs, 'item', { rohs: 'maybe' }, 'update-partial')).toThrowError(/枚举/);
  });

  it('AC#6：同一 code 跨作用域独立（唯一键含作用域）', () => {
    const defs: ExtAttrDefShape[] = [
      attrDef('rohs', 'string', { required: true, enumValues: ['yes'], appliesTo: 'item' }),
      attrDef('rohs', 'string', { appliesTo: 'bom_header' })
    ];
    expect(() => validateExtWrite(defs, 'item', { rohs: 'yes' }, 'create')).not.toThrow();
    expect(() => validateExtWrite(defs, 'bom_header', { rohs: 'no' }, 'create')).not.toThrow();
    // 两作用域的约束各自独立：item 侧的枚举与必填不影响 bom_header，反之亦然
    expect(() => validateExtWrite(defs, 'item', { rohs: 'no' }, 'create')).toThrowError(/枚举/);
    expect(() => validateExtWrite(defs, 'bom_header', {}, 'create')).not.toThrow();
    expect(() => validateExtWrite(defs, 'item', {}, 'create')).toThrowError(/rohs/);
  });

  it('dataType 不符拒绝：number / boolean / date / string', () => {
    const defs = [
      attrDef('leadDays', 'number'),
      attrDef('active', 'boolean'),
      attrDef('validFrom', 'date'),
      attrDef('note', 'string')
    ];
    expect(() => validateExtWrite(defs, 'item', { leadDays: '3' }, 'create')).toThrowError(/leadDays/);
    expect(() => validateExtWrite(defs, 'item', { leadDays: Number.NaN }, 'create')).toThrowError(/leadDays/);
    expect(() => validateExtWrite(defs, 'item', { leadDays: 3 }, 'create')).not.toThrow();
    expect(() => validateExtWrite(defs, 'item', { active: 1 }, 'create')).toThrowError(/active/);
    expect(() => validateExtWrite(defs, 'item', { active: true }, 'create')).not.toThrow();
    expect(() => validateExtWrite(defs, 'item', { validFrom: '01/02/2026' }, 'create')).toThrowError(/validFrom/);
    expect(() => validateExtWrite(defs, 'item', { validFrom: '2026-02-30' }, 'create')).toThrowError(/validFrom/);
    expect(() => validateExtWrite(defs, 'item', { validFrom: '2026-01-01T00:00:00.000Z' }, 'create')).not.toThrow();
    expect(() => validateExtWrite(defs, 'item', { note: 42 }, 'create')).toThrowError(/note/);
    // 显式 null 等价缺字段，非必填时放行
    expect(() => validateExtWrite(defs, 'item', { note: null }, 'create')).not.toThrow();
  });

  it('未知 dataType 声明 fail-fast', () => {
    expect(() => validateExtWrite([attrDef('x', 'text')], 'item', {}, 'create')).toThrowError(/dataType/);
  });
});

describe('buildExtFilterSql', () => {
  /** AC#4 的同一组过滤：string eq / number gte / boolean eq / date lt。 */
  const FILTERS: ExtFilter[] = [
    { code: 'rohs', op: 'eq', value: 'yes', dataType: 'string' },
    { code: 'leadDays', op: 'gte', value: 3, dataType: 'number' },
    { code: 'active', op: 'eq', value: true, dataType: 'boolean' },
    { code: 'validFrom', op: 'lt', value: '2026-06-01', dataType: 'date' }
  ];

  it('AC#4：同一组过滤两方言生成（关键谓词与 JSON 路径形态）', () => {
    const sqlite = buildExtFilterSql('sqlite', '', FILTERS).sql;
    expect(sqlite).toContain(`json_extract("ext", '$.rohs') = 'yes'`);
    expect(sqlite).toContain(`json_extract("ext", '$.leadDays') >= 3`);
    expect(sqlite).toContain(`json_extract("ext", '$.active') = TRUE`);
    expect(sqlite).toContain(`json_extract("ext", '$.validFrom') < '2026-06-01'`);
    const pglite = buildExtFilterSql('pglite', '', FILTERS).sql;
    expect(pglite).toContain(`"ext"->>'rohs' = 'yes'`);
    expect(pglite).toContain(`("ext"->'leadDays')::numeric >= 3`);
    expect(pglite).toContain(`("ext"->'active')::boolean = TRUE`);
    expect(pglite).toContain(`"ext"->>'validFrom' < '2026-06-01'`);
  });

  it('缺字段 / null 语义：ne 对二者均不匹配（IS NOT NULL AND 形态，含 ne 的契约）', () => {
    // US-519 契约：缺字段与显式 null 等价，其余比较对缺字段一律不匹配（含 ne）；
    // 提取对缺字段与 JSON null 都返回 SQL NULL，`IS NOT NULL AND <>` 让二者都落败。
    const sqlite = buildExtFilterSql('sqlite', '', [{ code: 'rohs', op: 'ne', value: 'yes', dataType: 'string' }]).sql;
    expect(sqlite).toContain(`json_extract("ext", '$.rohs') IS NOT NULL AND json_extract("ext", '$.rohs') <> 'yes'`);
    const pglite = buildExtFilterSql('pglite', '', [
      { code: 'active', op: 'ne', value: false, dataType: 'boolean' }
    ]).sql;
    expect(pglite).toContain(`("ext"->'active')::boolean IS NOT NULL AND ("ext"->'active')::boolean <> FALSE`);
  });

  it('exists 对缺字段与 null 均为假（IS NOT NULL 形态）', () => {
    expect(buildExtFilterSql('sqlite', '', [{ code: 'rohs', op: 'exists', dataType: 'string' }]).sql).toContain(
      `json_extract("ext", '$.rohs') IS NOT NULL`
    );
    expect(buildExtFilterSql('pglite', '', [{ code: 'rohs', op: 'exists', dataType: 'string' }]).sql).toContain(
      `"ext"->>'rohs' IS NOT NULL`
    );
  });

  it('in 展开为 OR 相等列表；空数组恒假；非数组拒绝', () => {
    const sqlite = buildExtFilterSql('sqlite', '', [
      { code: 'color', op: 'in', value: ['red', 'blue'], dataType: 'string' }
    ]).sql;
    expect(sqlite).toContain(`json_extract("ext", '$.color') = 'red' OR json_extract("ext", '$.color') = 'blue'`);
    expect(buildExtFilterSql('pglite', '', [{ code: 'color', op: 'in', value: [], dataType: 'string' }]).sql).toContain(
      '(1 = 0)'
    );
    expect(() =>
      buildExtFilterSql('sqlite', '', [{ code: 'color', op: 'in', value: 'red', dataType: 'string' }])
    ).toThrowError(/color/);
  });

  it('类型不符的过滤值两端都拒绝（不隐式转换）', () => {
    expect(() =>
      buildExtFilterSql('sqlite', '', [{ code: 'leadDays', op: 'eq', value: '3', dataType: 'number' }])
    ).toThrowError(/leadDays/);
    expect(() =>
      buildExtFilterSql('pglite', '', [{ code: 'active', op: 'eq', value: 1, dataType: 'boolean' }])
    ).toThrowError(/active/);
    expect(() =>
      buildExtFilterSql('sqlite', '', [{ code: 'validFrom', op: 'gt', value: '01/02/2026', dataType: 'date' }])
    ).toThrowError(/validFrom/);
    expect(() =>
      buildExtFilterSql('sqlite', '', [{ code: 'color', op: 'in', value: ['red', 7], dataType: 'string' }])
    ).toThrowError(/color/);
    expect(() => buildExtFilterSql('sqlite', '', [{ code: 'x', op: 'eq', value: 1, dataType: 'text' }])).toThrowError(
      /dataType/
    );
  });

  it('字符串字面量单引号翻倍；表限定；无过滤返回空串', () => {
    expect(
      buildExtFilterSql('sqlite', '', [{ code: 'note', op: 'eq', value: "it's", dataType: 'string' }]).sql
    ).toContain(`= 'it''s'`);
    expect(
      buildExtFilterSql('sqlite', '"bom"."bom_item"', [{ code: 'rohs', op: 'eq', value: 'yes', dataType: 'string' }])
        .sql
    ).toContain(`json_extract("bom"."bom_item"."ext", '$.rohs') = 'yes'`);
    expect(buildExtFilterSql('sqlite', '', []).sql).toBe('');
  });

  it('多条过滤按序 AND 组合', () => {
    const { sql } = buildExtFilterSql('sqlite', '', [
      { code: 'rohs', op: 'eq', value: 'yes', dataType: 'string' },
      { code: 'active', op: 'exists', dataType: 'boolean' }
    ]);
    expect(sql.split(' AND ')).toHaveLength(2);
    expect(sql).toContain(`json_extract("ext", '$.rohs') = 'yes'`);
    expect(sql).toContain(`json_extract("ext", '$.active') IS NOT NULL`);
  });
});
