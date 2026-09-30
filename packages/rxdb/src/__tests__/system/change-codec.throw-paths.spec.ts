/**
 * @fileoverview `change-codec` 的抛错与降级分支。
 *
 * 与 `change-codec.spec.ts` 分工：那份验的是**走得通**的往返（编码→解码→原值），
 * 本份验的是**走不通时会怎样**。分开是因为两者的失败含义不同——往返用例红了说明
 * 编解码不自洽，本份红了说明非法输入被静默放行，后者的现场要到很远的地方才炸：
 * 版本对不上的信封若不在解码处抛，旧格式就会一路流进实体，直到某次 `BigInt(undefined)`
 * 才报错，而那时早已看不出是哪条 change 带进来的。
 *
 * 这些路径在生产里都由**对端数据**触发（跨版本同步、老库里的遗留行、被截断的字节），
 * 恰好是最难在现场复盘的一类，所以按输入形状逐条钉死。
 */

import { describe, expect, it } from 'vitest';
import { PropertyType } from '../../entity/metadata-options.interface.js';
import type { EntityMetadata } from '../../entity/metadata.interface.js';
import {
  decodeRxDBChangeEntityId,
  decodeRxDBChangePatch,
  decodeRxDBEntityIdentity,
  encodeRxDBChangePatch,
  encodeRxDBEntityIdentity,
  RXDB_CHANGE_CODEC_VERSION,
  RXDB_CHANGE_ENTITY_ID_PREFIX,
  RXDB_CHANGE_SCHEMA_VERSION,
  RXDB_CHANGE_VALUE_ENVELOPE_KEY,
  UnsupportedRxDBChangeVersionError,
  UnsupportedRxDBEntityIdentityVersionError
} from '../../system/change-codec.js';

const metadata = {
  namespace: 'public',
  name: 'Asset',
  propertyMap: new Map([
    ['id', { name: 'id', columnName: 'id', type: PropertyType.bigint, primary: true }],
    ['amount', { name: 'amount', columnName: 'amount', type: PropertyType.bigint }],
    ['payload', { name: 'payload', columnName: 'payload', type: PropertyType.binary }]
  ]),
  foreignKeyRelationMap: new Map([
    ['accountId', { name: 'account', mappedEntity: 'Account', mappedNamespace: 'public' }]
  ])
} as unknown as EntityMetadata;

/** 只声明 `id`，用来当外键反查的对端。 */
const accountMetadata = {
  namespace: 'public',
  name: 'Account',
  propertyMap: new Map([['id', { name: 'id', columnName: 'id', type: PropertyType.bigint, primary: true }]])
} as unknown as EntityMetadata;

const resolveEntityMetadata = (entity: string, namespace: string): EntityMetadata | undefined =>
  entity === accountMetadata.name && namespace === accountMetadata.namespace ? accountMetadata : undefined;

/** 按当前版本造一个合法信封，再由各用例按需破坏其中一个字段。 */
const envelope = (fields: Record<string, unknown>) => ({
  [RXDB_CHANGE_VALUE_ENVELOPE_KEY]: {
    codecVersion: RXDB_CHANGE_CODEC_VERSION,
    schemaVersion: RXDB_CHANGE_SCHEMA_VERSION,
    ...fields
  }
});

/** entityId 信封是「前缀 + JSON」，这里只负责拼，合法性由用例决定。 */
const entityIdEnvelope = (payload: unknown) => RXDB_CHANGE_ENTITY_ID_PREFIX + JSON.stringify(payload);

describe('encodeRxDBChangePatch 的二进制入参形态', () => {
  it('接受 ArrayBuffer，并与入参解耦', () => {
    const source = Uint8Array.of(1, 2, 3, 4);
    const encoded = encodeRxDBChangePatch(metadata, { payload: source.buffer })!;

    source[0] = 9;

    expect(decodeRxDBChangePatch(metadata, encoded)!['payload']).toEqual(Uint8Array.of(1, 2, 3, 4));
  });

  it('接受非 Uint8Array 的视图，按其 byteOffset / byteLength 取字节', () => {
    // Int16Array 的两个元素在小端下正是 [1,0,2,0]；这里要的是「视图那一段」而不是整个 buffer。
    const backing = Int16Array.of(7, 1, 2, 7);
    const view = new DataView(backing.buffer, 2, 4);
    const encoded = encodeRxDBChangePatch(metadata, { payload: view })!;

    expect(decodeRxDBChangePatch(metadata, encoded)!['payload']).toEqual(Uint8Array.of(1, 0, 2, 0));
  });

  it('既不是 buffer 也不是视图时抛错，而不是落一段乱码进库', () => {
    expect(() => encodeRxDBChangePatch(metadata, { payload: 42 })).toThrow(TypeError);
    expect(() => encodeRxDBChangePatch(metadata, { payload: 42 })).toThrow('Invalid RxDB binary change value');
  });

  it('bigint 列收到非 bigint 时抛错', () => {
    expect(() => encodeRxDBChangePatch(metadata, { amount: '1' })).toThrow('RxDB bigint change value must be a bigint');
  });

  it('null / undefined 原样透传，不包信封', () => {
    expect(encodeRxDBChangePatch(metadata, { amount: null, payload: undefined })).toEqual({
      amount: null,
      payload: undefined
    });
  });

  it('patch 为 null / undefined 时返回 null', () => {
    expect(encodeRxDBChangePatch(metadata, null)).toBeNull();
    expect(encodeRxDBChangePatch(metadata, undefined)).toBeNull();
    expect(decodeRxDBChangePatch(metadata, null)).toBeNull();
    expect(decodeRxDBChangePatch(metadata, undefined)).toBeNull();
  });

  it('外键反查表里没有这个 key 时不编码，原值透传', () => {
    // `unknownId` 既不在 propertyMap，也不在 foreignKeyRelationMap：解析器给了也没处可查。
    const encoded = encodeRxDBChangePatch(metadata, { unknownId: 'as-is' }, resolveEntityMetadata)!;

    expect(encoded).toEqual({ unknownId: 'as-is' });
  });
});

describe('decodeRxDBChangePatch 的信封校验', () => {
  it('信封位上不是对象时抛错', () => {
    expect(() => decodeRxDBChangePatch(metadata, { amount: { [RXDB_CHANGE_VALUE_ENVELOPE_KEY]: 'nope' } })).toThrow(
      'Invalid RxDB change value envelope'
    );
  });

  it('版本对不上时抛 UnsupportedRxDBChangeVersionError，而不是按当前版本硬解', () => {
    const stale = { amount: envelope({ codecVersion: 0, type: 'bigint', value: '1' }) };

    expect(() => decodeRxDBChangePatch(metadata, stale)).toThrow(UnsupportedRxDBChangeVersionError);
  });

  it.each([
    ['未知的 type', { type: 'uuid', value: '1' }],
    ['payload 不是字符串', { type: 'bigint', value: 1 }]
  ])('%s 时抛错', (_label, fields) => {
    expect(() => decodeRxDBChangePatch(metadata, { amount: envelope(fields) })).toThrow(
      'Invalid RxDB change value envelope'
    );
  });

  it('信封 type 与列类型不符时抛错，并把两者都写进消息', () => {
    // 一条 binary 列上收到了 bigint 信封：两边都是合法信封，错的是配对。
    expect(() => decodeRxDBChangePatch(metadata, { payload: envelope({ type: 'bigint', value: '1' }) })).toThrow(
      'RxDB change value type mismatch: expected binary, received bigint'
    );
  });

  it('null / undefined 在解码侧同样原样透传', () => {
    expect(decodeRxDBChangePatch(metadata, { amount: null, payload: undefined })).toEqual({
      amount: null,
      payload: undefined
    });
  });

  describe('legacy（无信封）分支', () => {
    it('bigint 列上的 bigint 原样返回', () => {
      expect(decodeRxDBChangePatch(metadata, { amount: 7n })!['amount']).toBe(7n);
    });

    it.each([
      ['非安全整数', 2 ** 53],
      ['对象', {}],
      ['布尔', true]
    ])('bigint 列上的 %s 抛错', (_label, value) => {
      expect(() => decodeRxDBChangePatch(metadata, { amount: value })).toThrow(
        'Invalid legacy RxDB bigint change value'
      );
    });
  });
});

describe('decodeRxDBChangeEntityId', () => {
  it.each([[1], [2n]])('数值与 bigint 直接返回：%s', value => {
    expect(decodeRxDBChangeEntityId(value)).toBe(value);
  });

  it('既不是字符串也不是数值时抛错', () => {
    expect(() => decodeRxDBChangeEntityId({})).toThrow('Invalid RxDB change entityId');
  });

  it('带前缀但 JSON 解不开时抛错，并保留原始异常作为 cause', () => {
    let caught: unknown;
    try {
      decodeRxDBChangeEntityId(`${RXDB_CHANGE_ENTITY_ID_PREFIX}{oops`);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(TypeError);
    expect((caught as Error).message).toBe('Invalid RxDB change entityId envelope');
    expect((caught as Error).cause).toBeInstanceOf(Error);
  });

  it.each([
    ['JSON 解出来不是对象', entityIdEnvelope(123)],
    ['JSON 解出来是 null', entityIdEnvelope(null)]
  ])('%s 时抛错', (_label, value) => {
    expect(() => decodeRxDBChangeEntityId(value)).toThrow('Invalid RxDB change entityId envelope');
  });

  it('版本对不上时抛 UnsupportedRxDBChangeVersionError', () => {
    const stale = entityIdEnvelope({
      codecVersion: RXDB_CHANGE_CODEC_VERSION,
      schemaVersion: 0,
      type: 'string',
      value: 'x'
    });

    expect(() => decodeRxDBChangeEntityId(stale)).toThrow(UnsupportedRxDBChangeVersionError);
  });

  it.each([
    [
      'payload 不是字符串',
      {
        codecVersion: RXDB_CHANGE_CODEC_VERSION,
        schemaVersion: RXDB_CHANGE_SCHEMA_VERSION,
        type: 'string',
        value: 1
      }
    ],
    [
      '未知的 type',
      {
        codecVersion: RXDB_CHANGE_CODEC_VERSION,
        schemaVersion: RXDB_CHANGE_SCHEMA_VERSION,
        type: 'uuid',
        value: 'x'
      }
    ]
  ])('%s 时抛错', (_label, payload) => {
    expect(() => decodeRxDBChangeEntityId(entityIdEnvelope(payload))).toThrow('Invalid RxDB change entityId envelope');
  });

  it('number 型 payload 不是有限数时抛错，而不是返回 NaN', () => {
    const notFinite = entityIdEnvelope({
      codecVersion: RXDB_CHANGE_CODEC_VERSION,
      schemaVersion: RXDB_CHANGE_SCHEMA_VERSION,
      type: 'number',
      value: 'not-a-number'
    });

    expect(() => decodeRxDBChangeEntityId(notFinite)).toThrow('Invalid numeric RxDB change entityId');
  });
});

describe('RxDB entity identity 的字节格式', () => {
  it.each([[Number.NaN], [Number.POSITIVE_INFINITY]])('编码非有限数值 id（%s）时抛错', id => {
    expect(() => encodeRxDBEntityIdentity(id)).toThrow('RxDB entity number id must be finite');
  });

  it('魔数对上但版本字节不认识时，抛的是 identity 那条版本轴的错', () => {
    const encoded = encodeRxDBEntityIdentity(1);
    encoded[3] = 0x7f;

    expect(() => decodeRxDBEntityIdentity(encoded)).toThrow(UnsupportedRxDBEntityIdentityVersionError);
  });

  it('类型字节不认识时抛错', () => {
    const encoded = encodeRxDBEntityIdentity(1);
    encoded[4] = 0x7a;

    expect(() => decodeRxDBEntityIdentity(encoded)).toThrow('Invalid RxDB entity identity type');
  });

  it('number 型 payload 不是有限数时抛错', () => {
    // 保留 number 的类型字节，只把 payload 换成解不成数的字节。
    const prefix = encodeRxDBEntityIdentity(1).subarray(0, 5);
    const payload = new TextEncoder().encode('not-a-number');
    const corrupted = new Uint8Array(prefix.byteLength + payload.byteLength);
    corrupted.set(prefix);
    corrupted.set(payload, prefix.byteLength);

    expect(() => decodeRxDBEntityIdentity(corrupted)).toThrow('Invalid numeric RxDB entity identity');
  });
});
