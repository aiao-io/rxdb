/**
 * @fileoverview T034 红测试：变更单元模型与指纹口径（FR-003/FR-022/FR-027）。
 *
 * @remarks
 * 实现目标是 `src/commit/change-unit.ts`。这份文件是**唯一**一处定义「一个变更单元
 * 的内容指纹怎么算」的地方：`WorkingTreeEntry.fingerprint`（US-306）与
 * `Commit.contentFingerprint`（本 story）都由它合成，`commit-graph-guard.ts`（T038）
 * 则要在只拿得到落库行的前提下**重算**出同一个值。
 *
 * 由此推出的三条硬约束，本文件逐条钉死：
 *
 * 1. **摘要的输入集合 = `CommitChangeSet` 落库的那几列，一列不多一列不少。**
 *    多一列（比如 `baseFingerprint`，它在 §2.4 与 §2.7 两张表里都**不存在**）会让守卫
 *    永远重算不出原值——每一条自洽的链都会被判成损坏，而这个故障只在真正跑守卫时才现形。
 *    少一列则是反面：那一列被外部篡改后，`contentFingerprint` 纹丝不动，FR-022 的
 *    防篡改面上多一个洞。
 * 2. **摘要必须对「落库后再读回来」稳定。** `patch` 是 `PropertyType.json` 列，
 *    进出各走一次 `JSON.stringify` / `JSON.parse`，键序不保证、`undefined` 会被丢掉、
 *    `Date` 会变成 ISO 串。摘要若按内存对象的原样算，重算就会对不上。
 *    所以规范化形态取的是**落库形态**，不是内存形态。
 * 3. **摘要是摘要，不是序列化。** 拼接必须是单射的：`{ab: 'c'}` 与 `{a: 'bc'}`
 *    在任何「把键和值接起来」的实现里都是同一串字节。
 */

import { describe, expect, it } from 'vitest';
import type { CommitChangeUnit } from '../../commit/change-unit.js';
import { computeChangeUnitFingerprint, computeCommitContentFingerprint } from '../../commit/change-unit.js';

function createUnit(overrides: Partial<CommitChangeUnit> = {}): CommitChangeUnit {
  const { fingerprint, ...rest } = overrides;
  const base: Omit<CommitChangeUnit, 'fingerprint'> = {
    unitId: 'unit-1',
    transactionId: null,
    namespace: 'app',
    entity: 'Recipe',
    entityId: 'recipe-1',
    operation: 'update',
    patch: { title: 'after' },
    inversePatch: { title: 'before' },
    baseFingerprint: 'fp-base',
    origin: 'local',
    ...rest
  };
  return { ...base, fingerprint: fingerprint ?? computeChangeUnitFingerprint(base) };
}

const fingerprintOf = (overrides: Partial<CommitChangeUnit>): string => createUnit(overrides).fingerprint;

describe('单元指纹的输入集合（FR-003）', () => {
  it('落库的九列每一列都进摘要', () => {
    const baseline = fingerprintOf({});
    const variants: readonly (readonly [string, Partial<CommitChangeUnit>])[] = [
      ['unitId', { unitId: 'unit-2' }],
      ['transactionId', { transactionId: 'tx-1' }],
      ['namespace', { namespace: 'other' }],
      ['entity', { entity: 'Ingredient' }],
      ['entityId', { entityId: 'recipe-2' }],
      ['operation', { operation: 'delete' }],
      ['patch', { patch: { title: 'different' } }],
      ['inversePatch', { inversePatch: { title: 'different' } }],
      ['origin', { origin: 'remote_sync' }]
    ];
    // 漏掉任何一列，那一列被改写后 contentFingerprint 都纹丝不动——FR-022 的防篡改面上就多一个洞。
    for (const [field, overrides] of variants) {
      expect({ field, fingerprint: fingerprintOf(overrides) }).not.toEqual({ field, fingerprint: baseline });
    }
  });

  it('baseFingerprint 不进摘要 —— 没有任何一张表持久化它', () => {
    // 守卫只拿得到落库行。把一个落不了库的字段算进摘要，重算就永远差一截，
    // 于是「自洽的链」会被判成损坏，而这条故障只在跑守卫时才现形。
    expect(fingerprintOf({ baseFingerprint: 'fp-other' })).toBe(fingerprintOf({ baseFingerprint: 'fp-base' }));
    expect(fingerprintOf({ baseFingerprint: null })).toBe(fingerprintOf({ baseFingerprint: 'fp-base' }));
  });

  it('fingerprint 本身不进摘要 —— 它是摘要的输出不是输入', () => {
    const forged = createUnit({ fingerprint: 'forged' });
    expect(computeChangeUnitFingerprint(forged)).toBe(fingerprintOf({}));
  });

  it('三种操作各自得到不同的指纹', () => {
    const insert = fingerprintOf({ operation: 'insert', inversePatch: null });
    const update = fingerprintOf({ operation: 'update' });
    const remove = fingerprintOf({ operation: 'delete', patch: null });
    expect(new Set([insert, update, remove]).size).toBe(3);
  });
});

describe('规范化取的是落库形态，不是内存形态', () => {
  it('patch 的键序不进摘要 —— jsonb 与 JSON 往返都不保证键序', () => {
    const forward = fingerprintOf({ patch: { a: 1, b: 2, c: 3 } });
    const reversed = fingerprintOf({ patch: { c: 3, b: 2, a: 1 } });
    expect(forward).toBe(reversed);
  });

  it('值为 undefined 的键等同于不存在 —— JSON.stringify 会把它丢掉', () => {
    expect(fingerprintOf({ patch: { title: 'after', ghost: undefined } })).toBe(
      fingerprintOf({ patch: { title: 'after' } })
    );
  });

  it('Date 按其 ISO 串入摘要 —— 它落库就是这个样子', () => {
    const iso = '2026-09-12T03:04:05.000Z';
    expect(fingerprintOf({ patch: { at: new Date(iso) } })).toBe(fingerprintOf({ patch: { at: iso } }));
  });

  it('非有限数按 null 入摘要 —— JSON.stringify(NaN) 就是 null', () => {
    const asNull = fingerprintOf({ patch: { score: null } });
    expect(fingerprintOf({ patch: { score: Number.NaN } })).toBe(asNull);
    expect(fingerprintOf({ patch: { score: Number.POSITIVE_INFINITY } })).toBe(asNull);
  });

  it('null 的 patch 与空对象的 patch 不同', () => {
    expect(fingerprintOf({ patch: null })).not.toBe(fingerprintOf({ patch: {} }));
  });
});

describe('拼接是单射的 —— 摘要不是把字段接起来', () => {
  it('键与值的边界不可移动', () => {
    // 任何「key + value」直连的实现在这两条上给出同一串字节。
    expect(fingerprintOf({ patch: { ab: 'c' } })).not.toBe(fingerprintOf({ patch: { a: 'bc' } }));
  });

  it('类型参与区分 —— 字符串 "1" 不等于数字 1，也不等于 true', () => {
    const fingerprints = [
      fingerprintOf({ patch: { v: '1' } }),
      fingerprintOf({ patch: { v: 1 } }),
      fingerprintOf({ patch: { v: true } }),
      fingerprintOf({ patch: { v: null } }),
      fingerprintOf({ patch: { v: [1] } })
    ];
    expect(new Set(fingerprints).size).toBe(5);
  });

  it('数组的顺序与嵌套结构参与区分', () => {
    expect(fingerprintOf({ patch: { v: ['a', 'b'] } })).not.toBe(fingerprintOf({ patch: { v: ['b', 'a'] } }));
    expect(fingerprintOf({ patch: { v: [['a']] } })).not.toBe(fingerprintOf({ patch: { v: ['a'] } }));
  });

  it('字段之间的边界不可移动 —— 把内容从一列挪到另一列要换指纹', () => {
    expect(fingerprintOf({ namespace: 'app', entity: 'Recipe' })).not.toBe(
      fingerprintOf({ namespace: 'appRecipe', entity: '' })
    );
  });
});

describe('加密列的字节原样进摘要（FR-038）', () => {
  it('按字节区分，不按 JSON 形状', () => {
    const first = fingerprintOf({ patch: { secret: Uint8Array.of(1, 2, 3) } });
    const second = fingerprintOf({ patch: { secret: Uint8Array.of(1, 2, 4) } });
    expect(first).not.toBe(second);
  });

  it('同样的字节、不同的实例，指纹相同', () => {
    expect(fingerprintOf({ patch: { secret: Uint8Array.of(9, 8, 7) } })).toBe(
      fingerprintOf({ patch: { secret: Uint8Array.of(9, 8, 7) } })
    );
  });

  it('字节序列不与等长字符串混淆', () => {
    expect(fingerprintOf({ patch: { secret: Uint8Array.of(0x61, 0x62) } })).not.toBe(
      fingerprintOf({ patch: { secret: 'ab' } })
    );
  });
});

describe('落不了库的值被拒，而不是被悄悄近似', () => {
  it('函数 / Map / bigint 一律抛错，并指出出错的路径', () => {
    // 「尽力而为」的规范化会给出一个确定但无意义的摘要：两份不同的内容拿到同一个指纹，
    // 而它们落库时本来就会失败或变形。
    expect(() => fingerprintOf({ patch: { broken: () => 1 } })).toThrowError(/patch\.broken/);
    expect(() => fingerprintOf({ patch: { broken: new Map() } })).toThrowError(/patch\.broken/);
    expect(() => fingerprintOf({ patch: { broken: 1n } })).toThrowError(/patch\.broken/);
  });

  it('嵌套深处的非法值也报得出路径', () => {
    expect(() => fingerprintOf({ inversePatch: { outer: { list: [0, Symbol('x')] } } })).toThrowError(
      /inversePatch\.outer\.list\[1\]/
    );
  });
});

describe('commit 指纹由单元指纹合成', () => {
  const unit = createUnit();
  const baseInput = {
    kind: 'normal' as const,
    parentIds: ['commit-0'],
    message: 'first',
    author: 'jimmy',
    units: [unit]
  };

  it('恒为 64 位小写 hex，且与单元指纹不在同一个取值域', () => {
    const fingerprint = computeCommitContentFingerprint(baseInput);
    expect(fingerprint).toMatch(/^[0-9a-f]{64}$/);
    // 没有域分隔时，一个单元的指纹可能恰好也是某个 commit 的指纹——
    // 两种对象共用一个取值域，篡改检测就多了一条可替换路径。
    expect(fingerprint).not.toBe(unit.fingerprint);
  });

  it('不信调用方给的 unit.fingerprint —— 现算', () => {
    // 守卫只能从 ChangeSet 行重建单元，那里没有 fingerprint 列，只能现算；
    // 写入侧若采信入参，一个伪造的 fingerprint 就能让两条不同内容的 commit 指纹相同。
    const forged = { ...unit, fingerprint: 'forged' };
    expect(computeCommitContentFingerprint({ ...baseInput, units: [forged] })).toBe(
      computeCommitContentFingerprint(baseInput)
    );
  });

  it('单元内容变化会穿透到 commit 指纹', () => {
    const changed = createUnit({ patch: { title: 'different' } });
    expect(computeCommitContentFingerprint({ ...baseInput, units: [changed] })).not.toBe(
      computeCommitContentFingerprint(baseInput)
    );
  });

  it('空单元列表是合法输入 —— 两种系统根节点就是空的', () => {
    expect(computeCommitContentFingerprint({ ...baseInput, units: [] })).toMatch(/^[0-9a-f]{64}$/);
  });

  it('单元数量参与区分 —— 同一个单元重复两次不等于一次', () => {
    expect(computeCommitContentFingerprint({ ...baseInput, units: [unit, unit] })).not.toBe(
      computeCommitContentFingerprint(baseInput)
    );
  });

  it('父链顺序参与区分 —— 第一父是 firstParentId，不是集合成员', () => {
    expect(computeCommitContentFingerprint({ ...baseInput, parentIds: ['a', 'b'] })).not.toBe(
      computeCommitContentFingerprint({ ...baseInput, parentIds: ['b', 'a'] })
    );
  });

  it('message / author 的 null 与空串不混淆', () => {
    const asNull = computeCommitContentFingerprint({ ...baseInput, message: null, author: null });
    const asEmpty = computeCommitContentFingerprint({ ...baseInput, message: '', author: '' });
    expect(asNull).not.toBe(asEmpty);
  });
});
