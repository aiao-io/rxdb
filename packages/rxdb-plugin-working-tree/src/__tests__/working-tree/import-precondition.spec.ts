/**
 * @fileoverview US-319 导入的前像核对：哪些列参与比对、两侧的值怎么放到同一个刻度上。
 *
 * @remarks
 * 实现目标是 `src/working-tree/import-precondition.ts`。命令体怎么用它（插入时不存在、修改与删除时存在且对得上、
 * 链式按上一步的结果核对、零写入）在 `import-commits.spec.ts`「前像核对」一组；六个后端上业务表 `SELECT` 读回来的
 * 真实形态由一致性套件（`worktree.suite.ts`「导入远端提交」）证。这里钉两件纯函数上的事：
 *
 * 1. **列的去留**：簿记字段与派生索引列（捕获层的 untracked 口径）、readonly 列、加密列不比；认不出的列不能跳过。
 * 2. **值的刻度**：业务表那一侧是驱动交回的原始形态（SQLite 的 `0` / `1`、JSON 文本，PGlite 的 `Date`、原生数组），
 *    单元那一侧是解码之后的落库形态（布尔、ISO 串、嵌入的 JSON、`bigint`、字节）。两侧按列类型归到同一个刻度再比。
 */

import { Entity, EntityBase, getEntityMetadata, PropertyType, RelationKind, SyncType } from '@aiao/rxdb';
import { isEqual } from '@aiao/utils';
import { describe, expect, it } from 'vitest';
import {
  comparablePreImageValue,
  preImageFieldOf,
  preImageSelectSqlOf
} from '../../working-tree/import-precondition.js';
import { buildVersionedDomain } from '../../working-tree/versioned-domain.js';

/** 每种要讲的列各一列的实体。 */
@Entity({
  name: 'PreImageProbe',
  namespace: 'app',
  tableName: 'pre_image_probe',
  properties: [
    { name: 'title', type: PropertyType.string },
    { name: 'titleNorm', type: PropertyType.string, nullable: true },
    { name: 'kind', type: PropertyType.string, readonly: true },
    { name: 'secret', type: PropertyType.string, encrypted: true }
  ]
})
class PreImageProbe extends EntityBase {}

const PROBE = getEntityMetadata(PreImageProbe);

/** 外键的对端。 */
@Entity({
  name: 'PreImageOwner',
  namespace: 'app',
  tableName: 'pre_image_owner',
  properties: [{ name: 'label', type: PropertyType.string }]
})
class PreImageOwner extends EntityBase {}

/** 带一个多对一外键（`ownerId`）的实体。 */
@Entity({
  name: 'PreImageItem',
  namespace: 'app',
  tableName: 'pre_image_item',
  properties: [{ name: 'title', type: PropertyType.string }],
  relations: [{ name: 'owner', kind: RelationKind.MANY_TO_ONE, mappedEntity: 'PreImageOwner', mappedProperty: 'items' }]
})
class PreImageItem extends EntityBase {}

const OWNER = getEntityMetadata(PreImageOwner);
const ITEM = getEntityMetadata(PreImageItem);

/** 与捕获运行时同一个构造：`titleNorm` 是插件登记的派生索引列（第三类 untracked）。 */
const DOMAIN = buildVersionedDomain([
  {
    entityName: PROBE.name,
    namespace: PROBE.namespace,
    physicalTableNames: [PROBE.tableName],
    syncType: SyncType.None,
    derivedIndexColumns: ['titleNorm']
  }
]);

/** 解析外键对端的上下文；探针实体没有外键，用不到。 */
const CODEC = { resolveTargetMetadata: () => undefined };

/** 两侧的值在同一个刻度上相等吗。 */
const sameOnScale = (type: PropertyType, row: unknown, unit: unknown): boolean =>
  isEqual(comparablePreImageValue(type, row, 'row'), comparablePreImageValue(type, unit, 'unit'));

describe('preImageFieldOf：哪些列参与前像比对', () => {
  it('跟踪的业务列参与比对，带上它的物理列名与列类型', () => {
    expect(preImageFieldOf(DOMAIN, CODEC, PROBE, 'title')).toEqual({
      kind: 'compare',
      column: 'title',
      type: PropertyType.string
    });
  });

  it('簿记字段与派生索引列不比：与捕获层判 untracked 是同一个口径', () => {
    expect(preImageFieldOf(DOMAIN, CODEC, PROBE, 'updatedAt')).toEqual({ kind: 'skip', because: 'untracked' });
    expect(preImageFieldOf(DOMAIN, CODEC, PROBE, 'remoteId')).toEqual({ kind: 'skip', because: 'untracked' });
    expect(preImageFieldOf(DOMAIN, CODEC, PROBE, 'titleNorm')).toEqual({ kind: 'skip', because: 'untracked' });
  });

  it('readonly 列不比：mergeChanges 的 UPDATE 不写它们，导入设备上它们不随远端收敛', () => {
    expect(preImageFieldOf(DOMAIN, CODEC, PROBE, 'updatedBy')).toEqual({ kind: 'skip', because: 'readonly' });
    expect(preImageFieldOf(DOMAIN, CODEC, PROBE, 'createdBy')).toEqual({ kind: 'skip', because: 'readonly' });
    expect(preImageFieldOf(DOMAIN, CODEC, PROBE, 'kind')).toEqual({ kind: 'skip', because: 'readonly' });
  });

  it('加密列不比：信封逐次随机，叠业务表时又会重新加密，逐字节永不相等；比明文要解密，恢复路径上不解密', () => {
    expect(preImageFieldOf(DOMAIN, CODEC, PROBE, 'secret')).toEqual({ kind: 'skip', because: 'encrypted' });
  });

  it('认不出的列：unknown，由调用方判成对不上——核对不了的不能当成对得上', () => {
    expect(preImageFieldOf(DOMAIN, CODEC, PROBE, 'ghost')).toEqual({ kind: 'unknown' });
  });

  it('外键列参与比对：列名取关系上的那一列，类型是对端主键的类型；对端解析不到时按原样比', () => {
    const codec = {
      ...CODEC,
      resolveEntityMetadata: (entity: string, namespace: string) =>
        entity === OWNER.name && namespace === OWNER.namespace ? OWNER : undefined
    };

    expect(preImageFieldOf(DOMAIN, codec, ITEM, 'ownerId')).toEqual({
      kind: 'compare',
      column: 'ownerId',
      type: OWNER.propertyMap.get('id')?.type
    });
    expect(preImageFieldOf(DOMAIN, CODEC, ITEM, 'ownerId')).toEqual({
      kind: 'compare',
      column: 'ownerId',
      type: undefined
    });
  });
});

describe('preImageSelectSqlOf：读一批行的那条语句', () => {
  it('主键在前、要比的列在后；json / keyValue 列转成文本读，主键按类型内联成字面量', () => {
    const sql = preImageSelectSqlOf(
      '"pre_image_probe"',
      'id',
      [
        { kind: 'compare', column: 'meta', type: PropertyType.json },
        { kind: 'compare', column: 'title', type: PropertyType.string },
        { kind: 'compare', column: 'settings', type: 'keyValue' }
      ],
      ["o'clock", 42, 9007199254740993n]
    );

    expect(sql).toBe(
      'SELECT "id", CAST("meta" AS TEXT), "title", CAST("settings" AS TEXT) FROM "pre_image_probe" ' +
        `WHERE "id" IN ('o''clock', 42, 9007199254740993)`
    );
  });
});

describe('comparablePreImageValue：业务行与单元放到同一个刻度上', () => {
  it('布尔：SQLite 的 0 / 1 与 PGlite 的 true / false 都对得上单元里的布尔', () => {
    expect(sameOnScale(PropertyType.boolean, 1, true)).toBe(true);
    expect(sameOnScale(PropertyType.boolean, 0, false)).toBe(true);
    expect(sameOnScale(PropertyType.boolean, true, true)).toBe(true);
    expect(sameOnScale(PropertyType.boolean, 0, true)).toBe(false);
  });

  it('时刻：Date、ISO 串、毫秒数与带时区偏移的写法按同一个时刻比；差一毫秒就不等', () => {
    const unit = '2026-11-01T08:30:00.123Z';
    expect(sameOnScale(PropertyType.date, new Date(unit), unit)).toBe(true);
    expect(sameOnScale(PropertyType.date, unit, '2026-11-01T08:30:00.123+00:00')).toBe(true);
    expect(sameOnScale(PropertyType.date, Date.parse(unit), unit)).toBe(true);
    expect(sameOnScale(PropertyType.date, new Date('2026-11-01T08:30:00.124Z'), unit)).toBe(false);
  });

  it('时刻：认不出的写法原样比——只与一模一样的原值相等，不会被归成某个时刻', () => {
    expect(sameOnScale(PropertyType.date, 'not-a-date', 'not-a-date')).toBe(true);
    expect(sameOnScale(PropertyType.date, 'not-a-date', '2026-11-01T08:30:00.123Z')).toBe(false);
    expect(sameOnScale(PropertyType.date, true, true)).toBe(true);
  });

  it('JSON：业务行那一侧是 JSON 文本（SQLite 原样、PGlite 经 CAST），解析之后与单元里嵌入的值深比较', () => {
    expect(sameOnScale(PropertyType.json, '{"s":"x","a":1}', { a: 1, s: 'x' })).toBe(true);
    expect(sameOnScale(PropertyType.json, '"str"', 'str')).toBe(true);
    expect(sameOnScale(PropertyType.json, '{"a":2}', { a: 1 })).toBe(false);
    // 解析不了的文本与什么都不等：库里那一列已经坏了，不能当成「对得上」
    expect(sameOnScale(PropertyType.json, '{oops', '{oops')).toBe(false);
  });

  it('字符串数组：SQLite 的 JSON 文本与 PGlite 的原生数组都对得上单元里的数组', () => {
    expect(sameOnScale(PropertyType.stringArray, '["a","b"]', ['a', 'b'])).toBe(true);
    expect(sameOnScale(PropertyType.stringArray, ['a', 'b'], ['a', 'b'])).toBe(true);
    expect(sameOnScale(PropertyType.stringArray, ['a'], ['a', 'b'])).toBe(false);
  });

  it('bigint：驱动交回的 number / string / bigint 与解码后的 bigint 按十进制文本比，不丢精度', () => {
    expect(sameOnScale(PropertyType.bigint, '9007199254740993', 9007199254740993n)).toBe(true);
    expect(sameOnScale(PropertyType.bigint, 42, 42n)).toBe(true);
    expect(sameOnScale(PropertyType.bigint, 9007199254740993n, 9007199254740992n)).toBe(false);
  });

  it('bigint：不是十进制整数的值原样比，不会被凑成某个整数', () => {
    expect(sameOnScale(PropertyType.bigint, '12abc', 12n)).toBe(false);
    expect(sameOnScale(PropertyType.bigint, 1.5, 1.5)).toBe(true);
    expect(sameOnScale(PropertyType.bigint, 1.5, 1n)).toBe(false);
  });

  it('binary：两侧的字节逐个比；不是字节的值原样比', () => {
    expect(sameOnScale(PropertyType.binary, Uint8Array.of(1, 2, 255), Uint8Array.of(1, 2, 255))).toBe(true);
    expect(sameOnScale(PropertyType.binary, Uint8Array.of(1, 2), Uint8Array.of(1, 3))).toBe(false);
    expect(sameOnScale(PropertyType.binary, '0102', Uint8Array.of(1, 2))).toBe(false);
  });

  it('null 与 undefined 是同一个「没有值」；其余类型原样比', () => {
    expect(sameOnScale(PropertyType.string, null, undefined)).toBe(true);
    expect(sameOnScale(PropertyType.integer, 3, 3)).toBe(true);
    expect(sameOnScale(PropertyType.integer, 3, null)).toBe(false);
    expect(sameOnScale(PropertyType.string, 'H', 'H ')).toBe(false);
  });
});
