/**
 * @fileoverview US-217 实体结构指纹：同结构同指纹、结构变化必变、与声明顺序和展示文案无关。
 */

import { describe, expect, it } from 'vitest';
import {
  canonicalSchemaJson,
  computeRxDBSchemaFingerprint,
  schemaFingerprintInput
} from '../../backup/schema-fingerprint.js';
import { EntityBase } from '../../entity/entity-base.js';
import { Entity } from '../../entity/entity.decorator.js';
import { PropertyType } from '../../entity/metadata-options.interface.js';
import { CORE_SYSTEM_ENTITIES } from '../../system/system-entities.js';

@Entity({
  name: 'FingerprintNote',
  namespace: 'fp',
  displayName: '笔记',
  properties: [
    { name: 'title', type: PropertyType.string, displayName: '标题' },
    { name: 'size', type: PropertyType.bigint, default: 1n },
    { name: 'blob', type: PropertyType.binary, default: Uint8Array.of(1, 2) },
    { name: 'stamp', type: PropertyType.date, default: () => new Date() }
  ]
})
class FingerprintNote extends EntityBase {}

@Entity({
  name: 'FingerprintNote',
  namespace: 'fp_relabelled',
  displayName: '别的名字',
  properties: [
    { name: 'title', type: PropertyType.string, displayName: '换了文案' },
    { name: 'size', type: PropertyType.bigint, default: 1n },
    { name: 'blob', type: PropertyType.binary, default: Uint8Array.of(1, 2) },
    { name: 'stamp', type: PropertyType.date, default: () => new Date(0) }
  ]
})
class FingerprintNoteRelabelled extends EntityBase {}

@Entity({
  name: 'FingerprintNote',
  namespace: 'fp_changed',
  properties: [
    { name: 'title', type: PropertyType.string, nullable: true },
    { name: 'size', type: PropertyType.bigint, default: 1n },
    { name: 'blob', type: PropertyType.binary, default: Uint8Array.of(1, 2) },
    { name: 'stamp', type: PropertyType.date }
  ]
})
class FingerprintNoteChanged extends EntityBase {}

@Entity({
  name: 'FingerprintNote',
  namespace: 'fp_default',
  properties: [
    { name: 'title', type: PropertyType.string },
    { name: 'size', type: PropertyType.bigint, default: 2n },
    { name: 'blob', type: PropertyType.binary, default: Uint8Array.of(1, 2) },
    { name: 'stamp', type: PropertyType.date }
  ]
})
class FingerprintNoteDefault extends EntityBase {}

@Entity({ name: 'FingerprintTag', namespace: 'fp', properties: [{ name: 'label', type: PropertyType.string }] })
class FingerprintTag extends EntityBase {}

describe('computeRxDBSchemaFingerprint', () => {
  it('输出 64 位十六进制且确定', () => {
    const first = computeRxDBSchemaFingerprint([FingerprintNote, FingerprintTag]);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(computeRxDBSchemaFingerprint([FingerprintNote, FingerprintTag])).toBe(first);
  });

  it('与实体声明顺序无关', () => {
    expect(computeRxDBSchemaFingerprint([FingerprintTag, FingerprintNote])).toBe(
      computeRxDBSchemaFingerprint([FingerprintNote, FingerprintTag])
    );
  });

  it('忽略系统实体：由 systemSchemaVersion 单独把关', () => {
    expect(computeRxDBSchemaFingerprint([...CORE_SYSTEM_ENTITIES, FingerprintNote])).toBe(
      computeRxDBSchemaFingerprint([FingerprintNote])
    );
  });

  it('实体集合变化则指纹变化', () => {
    expect(computeRxDBSchemaFingerprint([FingerprintNote])).not.toBe(
      computeRxDBSchemaFingerprint([FingerprintNote, FingerprintTag])
    );
    expect(computeRxDBSchemaFingerprint([])).toMatch(/^[0-9a-f]{64}$/);
  });

  it('命名空间参与指纹', () => {
    expect(computeRxDBSchemaFingerprint([FingerprintNoteRelabelled])).not.toBe(
      computeRxDBSchemaFingerprint([FingerprintNote])
    );
  });

  it('字段约束与字面默认值进入指纹输入，展示文案与函数默认值不进入', () => {
    const note = canonicalSchemaJson(schemaFingerprintInput([FingerprintNote]));
    expect(note).not.toMatch(/笔记|标题|displayName/);
    expect(note).toContain('{"$bigint":"1"}');
    expect(note).toContain('{"$bytes":"0102"}');
    expect(canonicalSchemaJson(schemaFingerprintInput([FingerprintNoteChanged]))).toContain('"nullable":true');
    expect(canonicalSchemaJson(schemaFingerprintInput([FingerprintNoteDefault]))).toContain('{"$bigint":"2"}');
  });
});

describe('canonicalSchemaJson', () => {
  it('键排序、丢弃展示文案 / 函数 / Map / Set / undefined', () => {
    const value = {
      b: 1,
      a: {
        displayName: 'x',
        description: 'y',
        keep: true,
        fn: () => 1,
        map: new Map([[1, 2]]),
        set: new Set([1]),
        gone: undefined
      },
      list: [undefined, () => 1, 'v']
    };
    expect(canonicalSchemaJson(value)).toBe('{"a":{"keep":true},"b":1,"list":[null,null,"v"]}');
  });

  it('bigint / 二进制 / 日期 / 非有限数有确定编码', () => {
    expect(
      canonicalSchemaJson({ big: 12n, bin: Uint8Array.of(0, 255), at: new Date(0), nan: Number.NaN, inf: -Infinity })
    ).toBe(
      '{"at":{"$date":"1970-01-01T00:00:00.000Z"},"big":{"$bigint":"12"},"bin":{"$bytes":"00ff"},"inf":{"$number":"-Infinity"},"nan":{"$number":"NaN"}}'
    );
  });

  it('循环引用直接报错，不静默截断', () => {
    const node: Record<string, unknown> = {};
    node['self'] = node;
    expect(() => canonicalSchemaJson(node)).toThrow(/cycle/);
  });

  it('同一对象被多处引用不算循环', () => {
    const shared = { x: 1 };
    expect(canonicalSchemaJson({ a: shared, b: shared })).toBe('{"a":{"x":1},"b":{"x":1}}');
  });
});
