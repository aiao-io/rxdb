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

  it('serializes parseable date strings', () => {
    const iso = '2020-01-02T03:04:05.000Z';
    expect(roundTrip(iso, PropertyType.date)).toEqual(new Date(iso));
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

  // 写侧必须和读侧一样严格：读侧拒绝的负载一旦加密落盘，这一行之后每次读都失败，
  // 而加密列不能进查询，坏行找不到也清不掉。类型不符的值在写入这一刻就该被拒。
  describe('写侧与读侧同样严格', () => {
    it.each([
      ['字符串 false', 'false'],
      ['字符串 true', 'true'],
      ['0/1 之外的数字', 2],
      ['对象', {}],
      ['Uint8Array', new Uint8Array([1])]
    ])('boolean 拒绝 %s', (_name, value) => {
      expect(() => serializeForEnvelope(value, property(PropertyType.boolean))).toThrow(TypeError);
    });

    it('boolean 接受 SQL 形态的 0 / 1', () => {
      expect(roundTrip(1, PropertyType.boolean)).toBe(true);
      expect(roundTrip(0, PropertyType.boolean)).toBe(false);
    });

    it.each([
      ['非数字字符串', 'abc'],
      ['数字字符串', '12'],
      ['NaN', Number.NaN],
      ['Infinity', Number.POSITIVE_INFINITY],
      ['布尔', true],
      ['Uint8Array', new Uint8Array([0x31])]
    ])('number 拒绝 %s', (_name, value) => {
      expect(() => serializeForEnvelope(value, property(PropertyType.number))).toThrow(TypeError);
    });

    it.each([
      ['小数', 1.5],
      ['超出安全整数', 2 ** 53],
      ['数字字符串', '3'],
      ['NaN', Number.NaN]
    ])('integer 拒绝 %s', (_name, value) => {
      expect(() => serializeForEnvelope(value, property(PropertyType.integer))).toThrow(TypeError);
    });

    it.each([
      ['解析不了的字符串', 'not-a-date'],
      ['Invalid Date', new Date(Number.NaN)],
      ['NaN', Number.NaN],
      ['Infinity', Number.POSITIVE_INFINITY],
      ['布尔', true],
      ['对象', {}]
    ])('date 拒绝 %s', (_name, value) => {
      expect(() => serializeForEnvelope(value, property(PropertyType.date))).toThrow(TypeError);
    });

    it.each([
      ['stringArray 收到非字符串元素', [1], PropertyType.stringArray],
      ['stringArray 收到对象', { a: 1 }, PropertyType.stringArray],
      ['numberArray 收到字符串元素', ['a'], PropertyType.numberArray],
      ['numberArray 收到 NaN（JSON 里成了 null）', [Number.NaN], PropertyType.numberArray],
      ['keyValue 收到数组', [1, 2], PropertyType.keyValue],
      ['keyValue 收到字符串', 'text', PropertyType.keyValue]
    ] as const)('结构化类型拒绝形状不符的值：%s', (_name, value, type) => {
      expect(() => serializeForEnvelope(value, property(type))).toThrow(TypeError);
    });

    it.each([
      [true, PropertyType.boolean],
      [0, PropertyType.number],
      [-12.5, PropertyType.number],
      [Number.MAX_SAFE_INTEGER, PropertyType.integer],
      [new Date('2020-01-02T03:04:05.000Z'), PropertyType.date],
      [1_577_934_245_000, PropertyType.date],
      ['2020-01-02T03:04:05.000Z', PropertyType.date],
      [['a', 'b'], PropertyType.stringArray],
      [[1.5, -2], PropertyType.numberArray],
      [{ nested: { ok: true } }, PropertyType.keyValue],
      ['anything', PropertyType.string]
    ] as const)('写侧放行的值，读侧都读得回来：%j as %s', (value, type) => {
      expect(() => roundTrip(value, type)).not.toThrow();
    });
  });
});
