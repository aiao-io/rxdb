import { PropertyType, type EntityPropertyMetadata } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { EncryptedDecryptError } from '../errors.js';
import { deserializeFromEnvelope, serializeForEnvelope } from '../serialize.js';

const property = (type: PropertyType): EntityPropertyMetadata =>
  ({ name: 'value', columnName: 'value', type }) as EntityPropertyMetadata;

const roundTrip = (value: unknown, type = PropertyType.json): unknown =>
  deserializeFromEnvelope(serializeForEnvelope(value, property(type)), property(type));

describe('serializeForEnvelope / deserializeFromEnvelope', () => {
  it.each(['true', '123', 'null', '{"nested":true}', '[1,2]', 'plain text'])(
    'preserves JSON string %j as a string',
    value => {
      expect(roundTrip(value)).toBe(value);
    }
  );

  it.each([
    [{ nested: { ok: true } }, PropertyType.json],
    [[1, 'two', false], PropertyType.json],
    [123.5, PropertyType.json],
    [false, PropertyType.json],
    [null, PropertyType.json],
    [['a', 'b'], PropertyType.stringArray],
    [[1, 2], PropertyType.numberArray],
    [{ key: 'value' }, PropertyType.keyValue]
  ] as const)('round-trips structured value %#', (value, type) => {
    expect(roundTrip(value, type)).toEqual(value);
  });

  it('rejects JSON values that JSON.stringify cannot represent', () => {
    expect(() => serializeForEnvelope(undefined, property(PropertyType.json))).toThrow(TypeError);
  });

  it('passes Uint8Array plaintext through without re-encoding', () => {
    const bytes = new Uint8Array([1, 2, 3]);
    expect(serializeForEnvelope(bytes, property(PropertyType.string))).toBe(bytes);
  });

  it.each([-(1n << 63n), (1n << 63n) - 1n])('round-trips signed 64-bit bigint boundary %s', value => {
    const serialized = serializeForEnvelope(value, property(PropertyType.bigint));

    expect(new TextDecoder().decode(serialized)).toBe(value.toString(10));
    expect(deserializeFromEnvelope(serialized, property(PropertyType.bigint))).toBe(value);
  });

  it.each([-(1n << 63n) - 1n, 1n << 63n, 1, '1', new Uint8Array([1])])(
    'rejects invalid encrypted bigint value %s',
    value => {
      expect(() => serializeForEnvelope(value, property(PropertyType.bigint))).toThrow(TypeError);
    }
  );

  it.each(['+1', '01', '-0', '1.0', '9223372036854775808', '-9223372036854775809', 'not-a-bigint'])(
    'rejects non-canonical or out-of-range decrypted bigint payload %s',
    value => {
      expect(() => deserializeFromEnvelope(new TextEncoder().encode(value), property(PropertyType.bigint))).toThrow(
        EncryptedDecryptError
      );
    }
  );

  it('copies only the current binary view for encryption and restoration', () => {
    const backing = new Uint8Array([9, 0, 0xff, 7]);
    const view = backing.subarray(1, 3);
    const serialized = serializeForEnvelope(view, property(PropertyType.binary));

    expect(serialized).toEqual(new Uint8Array([0, 0xff]));
    expect(serialized).not.toBe(view);
    backing[1] = 8;
    expect(serialized).toEqual(new Uint8Array([0, 0xff]));

    const restored = deserializeFromEnvelope(serialized, property(PropertyType.binary));
    expect(restored).toEqual(new Uint8Array([0, 0xff]));
    expect(restored).not.toBe(serialized);
  });

  it.each([new ArrayBuffer(2), [1, 2], 'bytes'])('rejects non-Uint8Array encrypted binary value', value => {
    expect(() => serializeForEnvelope(value, property(PropertyType.binary))).toThrow(TypeError);
  });

  it.each([
    [true, PropertyType.boolean],
    [false, PropertyType.boolean],
    [42, PropertyType.number],
    [-7, PropertyType.integer],
    ['hello', PropertyType.string],
    [null, PropertyType.string]
  ] as const)('round-trips scalar %j as %s', (value, type) => {
    expect(roundTrip(value, type)).toEqual(value === null ? '' : value);
  });

  it('serializes Date instances and numeric timestamps', () => {
    const date = new Date('2020-01-02T03:04:05.000Z');
    expect(roundTrip(date, PropertyType.date)).toEqual(date);
    expect(roundTrip(date.valueOf(), PropertyType.date)).toEqual(date);
  });

  it('serializes parseable date strings and falls back for invalid ones', () => {
    const iso = '2020-01-02T03:04:05.000Z';
    expect(roundTrip(iso, PropertyType.date)).toEqual(new Date(iso));
    const raw = serializeForEnvelope('not-a-date', property(PropertyType.date));
    expect(new TextDecoder().decode(raw)).toBe('not-a-date');
  });

  it('rejects non-finite decrypted date and number payloads', () => {
    const garbage = new TextEncoder().encode('NaN');
    expect(() => deserializeFromEnvelope(garbage, property(PropertyType.date))).toThrow(EncryptedDecryptError);
    expect(() => deserializeFromEnvelope(garbage, property(PropertyType.number))).toThrow(EncryptedDecryptError);
  });

  // RAE-004：原用例把 `'{broken' -> '{broken'`、空 boolean -> false 锁成了正确行为。
  // 但 `serializeForEnvelope()` 产生的结构化值必然是合法 JSON —— AES-GCM 认证成功
  // 却解析不出来，只可能是格式版本错误、调用方误用或数据损坏，
  // 绝不能伪装成另一种业务类型交给上层（解密后的类型混淆）。
  it.each([
    ['无法解析的 JSON', '{broken', PropertyType.json],
    ['数组类型收到对象', '{"a":1}', PropertyType.stringArray],
    ['stringArray 含非字符串', '[1,2]', PropertyType.stringArray],
    ['numberArray 含非数字', '["a"]', PropertyType.numberArray],
    ['keyValue 收到数组', '[1,2]', PropertyType.keyValue],
    ['number 收到空文本', '', PropertyType.number],
    ['integer 收到小数', '1.5', PropertyType.integer],
    ['integer 超出安全整数', '9007199254740993', PropertyType.integer]
  ] as const)('拒绝解密后的非法负载：%s', (_name, text, type) => {
    expect(() => deserializeFromEnvelope(new TextEncoder().encode(text), property(type))).toThrow(
      EncryptedDecryptError
    );
  });

  it.each([
    ['空字节', new Uint8Array()],
    ['多字节', new Uint8Array([1, 0])],
    ['非 0/1 字节', new Uint8Array([2])]
  ])('拒绝非单字节 0/1 的 boolean 负载：%s', (_name, bytes) => {
    expect(() => deserializeFromEnvelope(bytes, property(PropertyType.boolean))).toThrow(EncryptedDecryptError);
  });

  it('保留合法 boolean 的单字节往返', () => {
    expect(deserializeFromEnvelope(new Uint8Array([1]), property(PropertyType.boolean))).toBe(true);
    expect(deserializeFromEnvelope(new Uint8Array([0]), property(PropertyType.boolean))).toBe(false);
  });
});
