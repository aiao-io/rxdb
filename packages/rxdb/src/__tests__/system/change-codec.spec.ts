import { describe, expect, it } from 'vitest';
import { PropertyType } from '../../entity/metadata-options.interface.js';
import type { EntityMetadata } from '../../entity/metadata.interface.js';
import {
  decodeRxDBChangeEntityId,
  decodeRxDBChangePatch,
  decodeRxDBEntityIdentity,
  encodeRxDBChangeEntityId,
  encodeRxDBChangePatch,
  encodeRxDBEntityIdentity,
  getRxDBChangeEntityIdQueryValues,
  getRxDBEntityIdentityKey,
  parseRxDBEntityIdentityKey,
  UnsupportedRxDBChangeVersionError,
  UnsupportedRxDBEntityIdentityVersionError
} from '../../system/change-codec.js';

const metadata = {
  namespace: 'public',
  name: 'Asset',
  propertyMap: new Map([
    ['id', { name: 'id', columnName: 'id', type: PropertyType.bigint, primary: true }],
    ['amount', { name: 'amount', columnName: 'amount', type: PropertyType.bigint }],
    ['payload', { name: 'payload', columnName: 'payload', type: PropertyType.binary }],
    ['secretAmount', { name: 'secretAmount', columnName: 'secretAmount', type: PropertyType.bigint, encrypted: true }],
    [
      'secretPayload',
      { name: 'secretPayload', columnName: 'secretPayload', type: PropertyType.binary, encrypted: true }
    ],
    ['data', { name: 'data', columnName: 'data', type: PropertyType.json }]
  ]),
  foreignKeyRelationMap: new Map([
    ['accountId', { name: 'account', mappedEntity: 'Account', mappedNamespace: 'public' }]
  ])
} as unknown as EntityMetadata;

const accountMetadata = {
  namespace: 'public',
  name: 'Account',
  propertyMap: new Map([['id', { name: 'id', columnName: 'id', type: PropertyType.bigint, primary: true }]])
} as unknown as EntityMetadata;

const resolveEntityMetadata = (entity: string, namespace: string): EntityMetadata | undefined =>
  entity === accountMetadata.name && namespace === accountMetadata.namespace ? accountMetadata : undefined;

describe('RxDB change codec', () => {
  it('round-trips bigint and copies the current binary view', () => {
    const source = new Uint8Array([9, 1, 2, 8]);
    const view = source.subarray(1, 3);
    const encoded = encodeRxDBChangePatch(metadata, {
      amount: 9_007_199_254_740_993n,
      payload: view
    });

    source[1] = 7;
    const decoded = decodeRxDBChangePatch(metadata, encoded)!;

    expect(decoded['amount']).toBe(9_007_199_254_740_993n);
    expect(decoded['payload']).toEqual(new Uint8Array([1, 2]));
    expect(decoded['payload']).not.toBe(view);
  });

  it.each([1n, 9_007_199_254_740_993n])(
    'round-trips bigint foreign key %s through mapped entity id metadata',
    accountId => {
      const encoded = encodeRxDBChangePatch(metadata, { accountId }, resolveEntityMetadata);

      expect(encoded).toEqual({
        accountId: {
          $rxdbChangeValue: {
            codecVersion: 1,
            schemaVersion: 1,
            type: 'bigint',
            value: accountId.toString()
          }
        }
      });
      expect(decodeRxDBChangePatch(metadata, encoded, resolveEntityMetadata)).toEqual({ accountId });
    }
  );

  it('does not interpret an envelope-shaped object in an ordinary JSON field', () => {
    const lookalike = {
      $rxdbChangeValue: { codecVersion: 1, schemaVersion: 1, type: 'bigint', value: '7' }
    };
    const decoded = decodeRxDBChangePatch(metadata, encodeRxDBChangePatch(metadata, { data: lookalike }))!;
    expect(decoded['data']).toEqual(lookalike);
  });

  it('preserves encrypted storage envelopes for typed properties', () => {
    const amountEnvelope = '{"v":1,"ciphertext":"amount"}';
    const payloadEnvelope = '{"v":1,"ciphertext":"payload"}';
    const encoded = encodeRxDBChangePatch(metadata, {
      secretAmount: amountEnvelope,
      secretPayload: payloadEnvelope
    });

    expect(encoded).toEqual({ secretAmount: amountEnvelope, secretPayload: payloadEnvelope });
    expect(decodeRxDBChangePatch(metadata, encoded)).toEqual(encoded);
  });

  it('fails fast for unsupported codec and schema versions', () => {
    const unsupportedCodec = {
      amount: { $rxdbChangeValue: { codecVersion: 2, schemaVersion: 1, type: 'bigint', value: '7' } }
    };
    const unsupportedSchema = {
      amount: { $rxdbChangeValue: { codecVersion: 1, schemaVersion: 2, type: 'bigint', value: '7' } }
    };

    expect(() => decodeRxDBChangePatch(metadata, unsupportedCodec)).toThrow(UnsupportedRxDBChangeVersionError);
    expect(() => decodeRxDBChangePatch(metadata, unsupportedSchema)).toThrow(UnsupportedRxDBChangeVersionError);
  });

  it('reads legacy plain JSON patches', () => {
    expect(decodeRxDBChangePatch(metadata, { amount: '7', payload: new Uint8Array([1]) })).toEqual({
      amount: 7n,
      payload: new Uint8Array([1])
    });
  });

  it.each([1, 1n, '1'] as const)('round-trips entity id %s through storage encoding', id => {
    expect(decodeRxDBChangeEntityId(encodeRxDBChangeEntityId(id))).toBe(id);
  });

  it('keeps legacy string entity ids readable and rejects unknown stored versions', () => {
    expect(decodeRxDBChangeEntityId('550e8400-e29b-41d4-a716-446655440000')).toBe(
      '550e8400-e29b-41d4-a716-446655440000'
    );
    expect(() =>
      decodeRxDBChangeEntityId('__rxdb_change_id__:{"codecVersion":2,"schemaVersion":1,"type":"bigint","value":"1"}')
    ).toThrow(UnsupportedRxDBChangeVersionError);
  });

  it('queries both legacy strings and typed storage envelopes without identity collisions', () => {
    const stringEnvelope = encodeRxDBChangeEntityId('1');
    const numberEnvelope = encodeRxDBChangeEntityId(1);
    const bigintEnvelope = encodeRxDBChangeEntityId(1n);

    expect(getRxDBChangeEntityIdQueryValues(['1', '1', 1, 1n])).toEqual([
      '1',
      stringEnvelope,
      numberEnvelope,
      bigintEnvelope
    ]);
    expect(new Set([stringEnvelope, numberEnvelope, bigintEnvelope]).size).toBe(3);
  });

  it('uses distinct identity keys while preserving existing string AAD bytes', () => {
    const stringBytes = encodeRxDBEntityIdentity('1');
    expect(stringBytes).toEqual(new TextEncoder().encode('1'));
    expect(decodeRxDBEntityIdentity(stringBytes)).toBe('1');
    expect(decodeRxDBEntityIdentity(encodeRxDBEntityIdentity(1))).toBe(1);
    expect(decodeRxDBEntityIdentity(encodeRxDBEntityIdentity(1n))).toBe(1n);

    const keys = [getRxDBEntityIdentityKey(1), getRxDBEntityIdentityKey(1n), getRxDBEntityIdentityKey('1')];
    expect(new Set(keys).size).toBe(3);
  });

  it('reports the identity version axis by name when the identity format is unsupported', () => {
    // identity 的版本字节与 change codec / schema 是**三条不同的轴**，只是当前都取 1。
    // 从前这里抛的是 `UnsupportedRxDBChangeVersionError(version, RXDB_CHANGE_SCHEMA_VERSION)`：
    // 第一个参数叫 codecVersion 却收着 identity 版本，第二个是常量、永远不是失败原因 ——
    // 排查的人会被引到 schema 上去。断言消息内容而非仅类型，就是为了钉住这一点。
    // 0xff 0x52 0x58 = IDENTITY_MAGIC；第 4 字节是版本（这里故意写 9）；0x6e = number tag。
    const futureIdentity = Uint8Array.of(0xff, 0x52, 0x58, 9, 0x6e, ...new TextEncoder().encode('1'));

    expect(() => decodeRxDBEntityIdentity(futureIdentity)).toThrow(UnsupportedRxDBEntityIdentityVersionError);
    expect(() => decodeRxDBEntityIdentity(futureIdentity)).toThrow(/entity identity version: stored=9, supported=1/);
    expect(() => decodeRxDBEntityIdentity(futureIdentity)).not.toThrow(UnsupportedRxDBChangeVersionError);
  });

  it('exposes the identity version error through the package barrel', async () => {
    // `decodeRxDBEntityIdentity` 是公开导出。它抛的错误类必须同样公开，否则使用者
    // 写不出 `catch (e) { if (e instanceof ...) }` —— 只能去匹配消息字符串。
    const barrel = await import('../../index.js');

    expect(barrel.UnsupportedRxDBEntityIdentityVersionError).toBe(UnsupportedRxDBEntityIdentityVersionError);
  });
});

describe('RxDB hex codec', () => {
  // 下面这组是给 bytesToHex / hexToBytes 换实现兜底的特征测试。两个函数都不导出，
  // 只能经 binary patch 与 identity key 这两条公开路径打到；它们同时是热路径
  // （cleanup-expired 的每条记录都要算一次 identity key），所以实现会被换掉，
  // 而换实现最容易悄悄破坏的就是补零、大小写与非法输入这三件事。

  it('round-trips every one of the 256 byte values through a binary patch', () => {
    // 逐字节钉死映射表：漏一个值、或 0x00-0x0f 少补一位零，这里立刻红。
    const allBytes = Uint8Array.from({ length: 256 }, (_, i) => i);

    const encoded = encodeRxDBChangePatch(metadata, { payload: allBytes })!;
    const wire = (encoded['payload'] as { $rxdbChangeValue: { value: string } })['$rxdbChangeValue'].value;

    expect(wire).toHaveLength(512); // 每字节恰好两位，没有变长输出
    expect(wire).toMatch(/^[0-9a-f]+$/); // 一律小写
    expect(wire.startsWith('000102')).toBe(true); // 低位字节补零
    expect(wire.endsWith('fdfeff')).toBe(true);
    expect(decodeRxDBChangePatch(metadata, encoded)!['payload']).toEqual(allBytes);
  });

  it('accepts upper-case hex in an identity key', () => {
    // 校验正则带 `i` 标志，大写本来就是合法输入（外部系统转发时很容易大写化）。
    // 换成 charCode 算术后若只认 a-f，这条会红。
    const key = getRxDBEntityIdentityKey(9_007_199_254_740_993n);
    const upper = `rxid1:${key.slice('rxid1:'.length).toUpperCase()}`;

    expect(upper).not.toBe(key); // 确认这次断言不是拿同一个串在自证
    expect(parseRxDBEntityIdentityKey(upper)).toBe(9_007_199_254_740_993n);
  });

  it('rejects malformed hex instead of returning a partial result', () => {
    expect(() => parseRxDBEntityIdentityKey('rxid1:abc')).toThrow(TypeError); // 奇数长度
    expect(() => parseRxDBEntityIdentityKey('rxid1:zz')).toThrow(TypeError); // 非 hex 字符
    expect(() => parseRxDBEntityIdentityKey('rxid1:ab cd')).toThrow(TypeError); // 空白不算合法
  });

  it('round-trips an empty binary value', () => {
    const encoded = encodeRxDBChangePatch(metadata, { payload: new Uint8Array(0) })!;

    expect((encoded['payload'] as { $rxdbChangeValue: { value: string } })['$rxdbChangeValue'].value).toBe('');
    expect(decodeRxDBChangePatch(metadata, encoded)!['payload']).toEqual(new Uint8Array(0));
  });
});
