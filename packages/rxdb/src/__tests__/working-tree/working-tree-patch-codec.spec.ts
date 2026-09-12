/**
 * @fileoverview T020 红测试：新表的 patch / inversePatch 复用同一份 change codec。
 *
 * @remarks
 * 契约见 `specs/001-working-tree-commits/data-model.md` §4。
 *
 * 「不写第二份编解码器」这句话没法靠读代码守住——抄一份改两行也编译得过。
 * 能守住它的只有一条可执行断言：**同一份元数据、同一份 patch，两边产物逐字节相等**。
 * 一旦有人另起炉灶（哪怕只是换了 envelope key 或版本号），这条立刻红。
 *
 * 加密列那条同理。`encrypted: true` 的值在进入本 codec 之前已经是一段密文 envelope，
 * 再包一层的后果不是报错而是**读端解出一坨字节流**——没有任何一步会抛，
 * 要到用户打开一条恢复出来的旧版本才发现字段全是乱码。所以断言写成引用相等
 * （`toBe`）而不是值相等：值相等允许"拷贝一份再放回去"，引用相等才排除了
 * 中间那次编解码。
 */

import { describe, expect, it } from 'vitest';
import { PropertyType } from '../../entity/metadata-options.interface.js';
import type { EntityMetadata } from '../../entity/metadata.interface.js';
import {
  decodeRxDBChangePatch,
  encodeRxDBChangePatch,
  RXDB_CHANGE_VALUE_ENVELOPE_KEY
} from '../../system/change-codec.js';
import {
  decodeWorkingTreePatch,
  encodeWorkingTreePatch,
  type WorkingTreePatchCodecContext
} from '../../working-tree/working-tree-patch-codec.js';

const assetMetadata = {
  namespace: 'public',
  name: 'Asset',
  propertyMap: new Map([
    ['id', { name: 'id', columnName: 'id', type: PropertyType.string, primary: true }],
    ['amount', { name: 'amount', columnName: 'amount', type: PropertyType.bigint }],
    ['payload', { name: 'payload', columnName: 'payload', type: PropertyType.binary }],
    ['secretAmount', { name: 'secretAmount', columnName: 'secretAmount', type: PropertyType.bigint, encrypted: true }],
    [
      'secretPayload',
      { name: 'secretPayload', columnName: 'secretPayload', type: PropertyType.binary, encrypted: true }
    ],
    ['title', { name: 'title', columnName: 'title', type: PropertyType.string }]
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
  entity === 'Account' && namespace === 'public' ? accountMetadata : undefined;

const context: WorkingTreePatchCodecContext = {
  resolveTargetMetadata: (entity, namespace) =>
    entity === 'Asset' && namespace === 'public' ? assetMetadata : undefined,
  resolveEntityMetadata
};

/** 工作树条目 / 提交变更集行上用来定位目标实体的那两列。 */
const target = { namespace: 'public', entity: 'Asset' } as const;

/** 该值是否被套上了 `change-codec` 的特殊类型信封。 */
const hasValueEnvelope = (value: unknown): boolean =>
  typeof value === 'object' && value !== null && RXDB_CHANGE_VALUE_ENVELOPE_KEY in value;

describe('工作树 patch codec', () => {
  it('产物与 change-codec 逐字节一致（同一份实现，不是第二份）', () => {
    const patch = { amount: 9_007_199_254_740_993n, payload: Uint8Array.of(1, 2, 3), title: 'x' };

    expect(encodeWorkingTreePatch(context, target, patch)).toEqual(
      encodeRxDBChangePatch(assetMetadata, patch, resolveEntityMetadata)
    );

    const encoded = encodeRxDBChangePatch(assetMetadata, patch, resolveEntityMetadata);
    expect(decodeWorkingTreePatch(context, target, encoded)).toEqual(
      decodeRxDBChangePatch(assetMetadata, encoded, resolveEntityMetadata)
    );
  });

  it('bigint / binary 往返回原值', () => {
    const patch = { amount: 9_007_199_254_740_993n, payload: Uint8Array.of(7, 8) };
    const encoded = encodeWorkingTreePatch(context, target, patch);

    expect(Object.values(encoded!).every(hasValueEnvelope)).toBe(true);
    expect(decodeWorkingTreePatch(context, target, encoded)).toEqual(patch);
  });

  it('encrypted: true 的列原样穿过，两个方向都不换引用', () => {
    const secretPayload = Uint8Array.of(0xde, 0xad, 0xbe, 0xef);
    const encoded = encodeWorkingTreePatch(context, target, { secretAmount: 1n, secretPayload })!;

    // 引用相等才排除了"拷一份再编码回去"。值相等挡不住二次编码。
    expect(encoded['secretPayload']).toBe(secretPayload);
    expect(encoded['secretAmount']).toBe(1n);
    // 裸 bigint 进不了 JSON——这里只能逐值看有没有被套上信封。
    expect(Object.values(encoded).some(hasValueEnvelope)).toBe(false);

    const decoded = decodeWorkingTreePatch(context, target, encoded)!;
    expect(decoded['secretPayload']).toBe(secretPayload);
    expect(decoded['secretAmount']).toBe(1n);
  });

  it('外键列委托 resolveEntityMetadata 反查对端 id 类型', () => {
    const encoded = encodeWorkingTreePatch(context, target, { accountId: 9_007_199_254_740_993n })!;

    expect(encoded['accountId']).toEqual({
      $rxdbChangeValue: { codecVersion: 1, schemaVersion: 1, type: 'bigint', value: '9007199254740993' }
    });
    expect(decodeWorkingTreePatch(context, target, encoded)).toEqual({ accountId: 9_007_199_254_740_993n });
  });

  it('null / undefined patch 两个方向都归一成 null', () => {
    expect(encodeWorkingTreePatch(context, target, null)).toBeNull();
    expect(encodeWorkingTreePatch(context, target, undefined)).toBeNull();
    expect(decodeWorkingTreePatch(context, target, null)).toBeNull();
    expect(decodeWorkingTreePatch(context, target, undefined)).toBeNull();
  });

  it('解码时目标实体未在本进程注册 → 原样返回，不猜着解', () => {
    const stored = { amount: { $rxdbChangeValue: { codecVersion: 1, schemaVersion: 1, type: 'bigint', value: '1' } } };

    expect(decodeWorkingTreePatch(context, { namespace: 'public', entity: 'Unknown' }, stored)).toEqual(stored);
  });

  it('编码时目标实体未注册 → 抛，不把未编码值静默落盘', () => {
    // 落一个没编码的 bigint 进 json 列，冷重放会少一个字段，而且全程零报错。
    expect(() => encodeWorkingTreePatch(context, { namespace: 'public', entity: 'Unknown' }, { amount: 1n })).toThrow(
      /public\.Unknown/
    );
  });

  it('解码拒绝数组与非对象', () => {
    expect(() => decodeWorkingTreePatch(context, target, [1, 2])).toThrow(TypeError);
    expect(() => decodeWorkingTreePatch(context, target, 'patch')).toThrow(TypeError);
  });
});
