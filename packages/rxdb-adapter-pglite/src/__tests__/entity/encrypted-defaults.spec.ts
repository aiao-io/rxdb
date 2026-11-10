/**
 * 缺省加密列的默认值补全（纯函数）：补的范围与建表 DDL 原先会写的那类默认值同口径。
 */
import { PropertyType, transitionMetadata, type EntityMetadataOptions } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { fillEncryptedDefaults, isCurrentTimestampDefault } from '../../entity/encrypted-defaults.js';

const metadata = transitionMetadata({
  name: 'EncDefaultsUnit',
  properties: [
    { name: 'id', type: PropertyType.uuid, primary: true },
    { name: 'secret', type: PropertyType.string, encrypted: true, default: 'secret-default' },
    { name: 'stampedAt', type: PropertyType.date, encrypted: true, default: 'CURRENT_TIMESTAMP' },
    { name: 'nowAt', type: PropertyType.date, encrypted: true, default: 'now()' },
    { name: 'renamed', columnName: 'renamed_col', type: PropertyType.integer, encrypted: true, default: 7 },
    { name: 'fromFunction', type: PropertyType.string, encrypted: true, default: () => 'from-function' },
    { name: 'blob', type: PropertyType.binary, encrypted: true, nullable: true, default: new Uint8Array([1]) },
    { name: 'noDefault', type: PropertyType.string, encrypted: true, nullable: true },
    { name: 'label', type: PropertyType.string, default: 'plain-default' }
  ]
} as unknown as EntityMetadataOptions);

describe('fillEncryptedDefaults', () => {
  it('按物理列名补上缺省加密列的字面量默认值，当前时刻写法取本次写入的时刻', () => {
    const now = new Date('2026-01-02T03:04:05.000Z');
    const columns: Record<string, unknown> = { id: 'row-1' };

    fillEncryptedDefaults(metadata, columns, now);

    expect(columns).toEqual({
      id: 'row-1',
      secret: 'secret-default',
      stampedAt: now,
      nowAt: now,
      renamed_col: 7
    });
    expect(columns['stampedAt']).toBe(now);
  });

  it('不补函数默认值、binary 列、没有默认值的加密列，也不碰普通列', () => {
    const columns: Record<string, unknown> = {};

    fillEncryptedDefaults(metadata, columns, new Date());

    expect(Object.keys(columns)).not.toContain('fromFunction');
    expect(Object.keys(columns)).not.toContain('blob');
    expect(Object.keys(columns)).not.toContain('noDefault');
    expect(Object.keys(columns)).not.toContain('label');
  });

  it('显式给了值（含 null）的列不动，显式写成 undefined 的按缺省处理', () => {
    const columns: Record<string, unknown> = { secret: null, renamed_col: 0, stampedAt: undefined };

    fillEncryptedDefaults(metadata, columns, new Date('2026-01-02T03:04:05.000Z'));

    expect(columns['secret']).toBeNull();
    expect(columns['renamed_col']).toBe(0);
    expect(columns['stampedAt']).toEqual(new Date('2026-01-02T03:04:05.000Z'));
  });
});

describe('isCurrentTimestampDefault', () => {
  it('只认 CURRENT_TIMESTAMP 与 now() 两种写法，与建表 DDL 的 DEFAULT now() 同一组', () => {
    expect(isCurrentTimestampDefault('CURRENT_TIMESTAMP')).toBe(true);
    expect(isCurrentTimestampDefault('now()')).toBe(true);
    expect(isCurrentTimestampDefault('NOW()')).toBe(false);
    expect(isCurrentTimestampDefault('now')).toBe(false);
    expect(isCurrentTimestampDefault(new Date())).toBe(false);
    expect(isCurrentTimestampDefault(undefined)).toBe(false);
  });
});
