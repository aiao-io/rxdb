/**
 * @fileoverview T041 红测试：commit / ChangeSet / baseline 的加密列 at-rest 绑定（FR-038）。
 *
 * @remarks
 * 这一层守的是 T020 与 T029 之间那道缝。T020（`working-tree-patch-codec.spec.ts`）钉的是
 * 「codec 不碰加密列」，T029（`commit-encryption.spec.ts`）钉的是「写入方拿到 patch 之后
 * 不再动它」。两条都成立，加密列的明文**仍然**可以躺进 `rxdb_commit_change_set`——
 * 因为谁都没有检查过「交给 commit 的那个值到底是不是已经加密了」。codec 跳过加密列，
 * 正意味着它对这些列的内容一无所知：捕获方给什么就落什么。
 *
 * ## 落库形态是**信封字符串**，不是裸字节
 *
 * 这一条决定了本文件全部断言的方向，而代码里曾有两种说法，必须按实际行为定案：
 *
 * - 写端 `rxdb-adapter-sqlite-core/src/sqlite-core.utils.ts` 把 `keyring.encrypt()` 的
 *   返回值直接写进列；读端在同一文件里对非字符串的值抛
 *   `EncryptedDecryptError({ code: 'malformed_envelope' })`，措辞是
 *   「is not a string envelope」。
 * - PGlite 的捕获触发器（`rxdb-adapter-pglite/src/table/trigger_sql.ts`）取的是
 *   `to_jsonb(NEW."col")`，即**已加密的那一列**，拿到的同样是那个字符串。
 *
 * 所以一段裸 `Uint8Array` 出现在加密列上**一定**是错的，而且是那种不会报错的错：
 * `patch` 是 `PropertyType.json` 列，字节数组进出一趟就变成 `{"0":222,…}`，
 * 写得进、读得回、解密时才炸，且炸在与写入无关的另一次调用里
 * （`change-unit.ts` 的 `canonicalizeBytes` 也因此会与落库行分叉，
 * 让这条 commit 被守卫判成 `fingerprint_mismatch`）。
 *
 * ## 判定器必须由调用方注入，不能在这里认形状
 *
 * 两条各自独立的理由：
 *
 * 1. 一个 `PropertyType.string` 的加密列，明文与密文**都是字符串**。脱离具体加密方案，
 *    「这是不是已加密的形态」在形状上无法判定；自己猜一套规则出来，等于给 FR-038
 *    装一个会看走眼的门卫。
 * 2. 权威判定器是 `@aiao/rxdb-adapter-encrypted` 的 `isEnvelope`，而
 *    `@aiao/rxdb` **不能**依赖它——后者 peer-depend 前者，依赖方向是反的
 *    （既有先例见 `entity/metadata-transition.ts`）。
 *
 * ## 没给判定器时 fail-closed
 *
 * 「没有判定器 → 跳过检查」会让一次漏配把整条安全检查静默关掉，且现象是「全绿」。
 * 实体没有加密属性时不需要判定器（没有要判的列），一旦有，就必须给。
 *
 * ## 这里**没有** encode
 *
 * commit 是一次拷贝：捕获阶段已经编码过一次，写入方再 encode 一遍就是二次包裹
 * （T029 第 3 条钉的正是这个）。所以本模块只提供「校验」与「解码」，
 * 不提供任何 encode 入口——提供了就一定有人调用。
 */

import type { EntityMetadata } from '@aiao/rxdb';
import { type EntityPropertyMetadata, PropertyType, RXDB_CHANGE_VALUE_ENVELOPE_KEY } from '@aiao/rxdb';
import { describe, expect, it, vi } from 'vitest';
import type { CommitChangeUnitContent } from '../../commit/change-unit.js';
import type {
  CommitChangeSetRow,
  CommitEncryptedAtRestRecognizer,
  CommitPatchCodecContext
} from '../../commit/commit-codec.js';
import {
  assertCommitUnitsEncryptedAtRest,
  CommitEncryptedAtRestError,
  decodeCommitChangeSetUnit,
  decodeCommitChangeSetUnits
} from '../../commit/commit-codec.js';
import {
  encodeWorkingTreePatch,
  UnknownWorkingTreePatchEntityError
} from '../../working-tree/working-tree-patch-codec.js';

/** 只应存在于**加密前**那个值里的串；它出现在库里、错误里、日志里都是泄漏。 */
const SENTINEL = 'PLAINTEXT-SENTINEL-7b1e4d';

/** 一段形如 `v|alg|kid|iv|ct|tag` 的信封串——加密列落库就长这样。 */
const ENVELOPE = 'v1|A256GCM|kid-1|3q2-7w|3q2-78A|f39_AA';

/** 裸密文字节：codec 不碰加密列，所以它能一路走到落库那一步而不报任何错。 */
const RAW_CIPHERTEXT = Uint8Array.of(0xde, 0xad, 0xbe, 0xef);

/** 普通（未加密）二进制列的值，用来证明本断言不越界管它。 */
const BLOB = Uint8Array.of(0x01, 0x02, 0x03);

/**
 * `@aiao/rxdb-adapter-encrypted` 的 `isEnvelope` 在本包内的替身。
 *
 * @remarks
 * 判定口径刻意写得比真品松（只看分段数与版本前缀）：本文件要证明的是
 * 「判定器被调用、结论被采纳」，不是「判定器判得准」——后者是加密包自己的单测。
 */
const isEnvelopeLike: CommitEncryptedAtRestRecognizer = value =>
  typeof value === 'string' && value.startsWith('v1|') && value.split('|').length === 6;

interface PropertyInit {
  readonly name: string;
  readonly type: PropertyType;
  readonly encrypted?: boolean;
  readonly primary?: boolean;
}

/**
 * 造一份最小可用的实体元数据。
 *
 * @remarks
 * `encryptedPropertyMap` 由 `propertyMap` 现推，而不是两处各写一份——真实元数据里它也是
 * `entity/metadata-transition.ts` 推出来的派生值，fixture 手写两份就会在「加了加密列却忘了
 * 同步那张表」时给出一个真实代码不可能出现的组合。
 */
const createMetadata = (name: string, properties: readonly PropertyInit[]): EntityMetadata => {
  const propertyMap = new Map<string, EntityPropertyMetadata>();
  const encryptedPropertyMap = new Map<string, EntityPropertyMetadata>();
  for (const init of properties) {
    const property = { columnName: init.name, ...init } as unknown as EntityPropertyMetadata;
    propertyMap.set(init.name, property);
    if (init.encrypted === true) encryptedPropertyMap.set(init.name, property);
  }
  return { namespace: 'app', name, propertyMap, encryptedPropertyMap } as unknown as EntityMetadata;
};

/** 带两个加密列（一个 binary、一个 string）、一个普通 binary 列与一个普通 string 列。 */
const secretMetadata = createMetadata('Secret', [
  { name: 'id', type: PropertyType.string, primary: true },
  { name: 'title', type: PropertyType.string },
  { name: 'blob', type: PropertyType.binary },
  { name: 'secret', type: PropertyType.binary, encrypted: true },
  { name: 'note', type: PropertyType.string, encrypted: true }
]);

/** 一个加密列都没有的实体。 */
const plainMetadata = createMetadata('Plain', [
  { name: 'id', type: PropertyType.string, primary: true },
  { name: 'title', type: PropertyType.string },
  { name: 'amount', type: PropertyType.bigint }
]);

const registry = new Map<string, EntityMetadata>([
  ['app.Secret', secretMetadata],
  ['app.Plain', plainMetadata]
]);

const resolveTargetMetadata = (entity: string, namespace: string): EntityMetadata | undefined =>
  registry.get(`${namespace}.${entity}`);

/** 注入了判定器的上下文；真实调用点注入的是加密包的 `isEnvelope`。 */
const contextWith = (isEncryptedAtRest: CommitEncryptedAtRestRecognizer): CommitPatchCodecContext => ({
  resolveTargetMetadata,
  isEncryptedAtRest
});

/** 没有判定器的上下文——只有「实体不含加密属性」时才允许走到这里。 */
const bareContext: CommitPatchCodecContext = { resolveTargetMetadata };

const createUnit = (overrides: Partial<CommitChangeUnitContent> = {}): CommitChangeUnitContent => ({
  unitId: 'unit-1',
  transactionId: null,
  namespace: 'app',
  entity: 'Secret',
  entityId: 'secret-1',
  operation: 'update',
  patch: { secret: ENVELOPE },
  inversePatch: null,
  origin: 'local',
  ...overrides
});

const createRow = (overrides: Partial<CommitChangeSetRow> = {}): CommitChangeSetRow => ({
  unitId: 'unit-1',
  transactionId: null,
  namespace: 'app',
  entity: 'Secret',
  entityId: 'secret-1',
  operation: 'update',
  patch: null,
  inversePatch: null,
  origin: 'local',
  ...overrides
});

/** 把错误的全部可见面摊成一个串：message、`String(error)`，以及自有属性的序列化。 */
const errorSurfaceOf = (error: unknown): string =>
  [
    error instanceof Error ? error.message : '',
    String(error),
    typeof error === 'object' && error !== null ? JSON.stringify(error, Object.getOwnPropertyNames(error)) : ''
  ].join('\n');

describe('加密列必须以落库形态进入 commit（FR-038）', () => {
  it('信封形态原样通过——且判定器确实看过它，本组其余断言不是空跑', () => {
    const isEncryptedAtRest = vi.fn(isEnvelopeLike);
    const unit = createUnit({ patch: { secret: ENVELOPE }, inversePatch: { note: ENVELOPE } });

    expect(() => assertCommitUnitsEncryptedAtRest(contextWith(isEncryptedAtRest), [unit])).not.toThrow();
    expect(isEncryptedAtRest.mock.calls.map(([value]) => value)).toEqual([ENVELOPE, ENVELOPE]);
  });

  it('明文落进加密列时拒绝——哪怕它是个合法字符串', () => {
    const unit = createUnit({ patch: { note: SENTINEL } });

    expect(() => assertCommitUnitsEncryptedAtRest(contextWith(isEnvelopeLike), [unit])).toThrow(
      CommitEncryptedAtRestError
    );
  });

  it('裸密文字节同样被拒：它一进 json 列就会变成 {"0":222,…}', () => {
    const unit = createUnit({ patch: { secret: RAW_CIPHERTEXT } });

    expect(() => assertCommitUnitsEncryptedAtRest(contextWith(isEnvelopeLike), [unit])).toThrow(
      CommitEncryptedAtRestError
    );
  });

  it('inversePatch 与 patch 同权——恢复数据泄漏和正向数据泄漏是同一件事', () => {
    const unit = createUnit({ patch: null, inversePatch: { secret: SENTINEL } });

    const error = (() => {
      try {
        assertCommitUnitsEncryptedAtRest(contextWith(isEnvelopeLike), [unit]);
        return undefined;
      } catch (caught: unknown) {
        return caught;
      }
    })();

    expect(error).toBeInstanceOf(CommitEncryptedAtRestError);
    expect((error as CommitEncryptedAtRestError).column).toBe('inversePatch');
    expect((error as CommitEncryptedAtRestError).property).toBe('secret');
  });

  it('null / undefined 没有值可泄漏，不进判定', () => {
    const isEncryptedAtRest = vi.fn(isEnvelopeLike);
    const unit = createUnit({ patch: { secret: null, note: undefined } });

    expect(() => assertCommitUnitsEncryptedAtRest(contextWith(isEncryptedAtRest), [unit])).not.toThrow();
    expect(isEncryptedAtRest).not.toHaveBeenCalled();
  });

  it('非加密列不进判定：普通列里的明文本来就该是明文', () => {
    const isEncryptedAtRest = vi.fn(isEnvelopeLike);
    const unit = createUnit({ patch: { title: SENTINEL, blob: RAW_CIPHERTEXT, unknownColumn: SENTINEL } });

    expect(() => assertCommitUnitsEncryptedAtRest(contextWith(isEncryptedAtRest), [unit])).not.toThrow();
    expect(isEncryptedAtRest).not.toHaveBeenCalled();
  });

  it('整批里只要有一条不合规就整批拒绝，错误指名到那一条', () => {
    const units = [
      createUnit({ unitId: 'unit-1', patch: { secret: ENVELOPE } }),
      createUnit({ unitId: 'unit-2', entityId: 'secret-2', patch: { note: SENTINEL } })
    ];

    const error = (() => {
      try {
        assertCommitUnitsEncryptedAtRest(contextWith(isEnvelopeLike), units);
        return undefined;
      } catch (caught: unknown) {
        return caught;
      }
    })();

    expect(error).toBeInstanceOf(CommitEncryptedAtRestError);
    expect((error as CommitEncryptedAtRestError).unitId).toBe('unit-2');
    expect((error as CommitEncryptedAtRestError).entityId).toBe('secret-2');
  });
});

describe('fail-closed：没有判定器就不放行', () => {
  it('加密列真的带了值却没注入判定器时抛错，而不是当成「没有加密列」放行', () => {
    const unit = createUnit({ patch: { secret: ENVELOPE } });

    expect(() => assertCommitUnitsEncryptedAtRest(bareContext, [unit])).toThrow(CommitEncryptedAtRestError);
  });

  it('缺判定器的报错必须是本模块抛的，不是「isEncryptedAtRest is not a function」', () => {
    const unit = createUnit({ patch: { secret: ENVELOPE } });

    const error = (() => {
      try {
        assertCommitUnitsEncryptedAtRest(bareContext, [unit]);
        return undefined;
      } catch (caught: unknown) {
        return caught;
      }
    })();

    expect(error).toBeInstanceOf(CommitEncryptedAtRestError);
    expect(error).not.toBeInstanceOf(TypeError);
  });

  it('实体没有加密属性时不需要判定器——没有要判的列', () => {
    const unit = createUnit({ entity: 'Plain', entityId: 'plain-1', patch: { title: SENTINEL } });

    expect(() => assertCommitUnitsEncryptedAtRest(bareContext, [unit])).not.toThrow();
  });

  it('目标实体未注册时抛 UnknownWorkingTreePatchEntityError，与 encodeWorkingTreePatch 同口径', () => {
    const unit = createUnit({ entity: 'Ghost', patch: { secret: ENVELOPE } });

    expect(() => assertCommitUnitsEncryptedAtRest(contextWith(isEnvelopeLike), [unit])).toThrow(
      UnknownWorkingTreePatchEntityError
    );
  });
});

describe('baseline 提交没有加密暴露面', () => {
  it('units 为空时是 no-op，且不需要判定器', () => {
    expect(() => assertCommitUnitsEncryptedAtRest(bareContext, [])).not.toThrow();
  });
});

describe('错误面不含任何字段值（FR-038）', () => {
  it('被拒的明文不出现在错误的任何一个面上', () => {
    const unit = createUnit({ patch: { note: SENTINEL } });

    const error = (() => {
      try {
        assertCommitUnitsEncryptedAtRest(contextWith(isEnvelopeLike), [unit]);
        return undefined;
      } catch (caught: unknown) {
        return caught;
      }
    })();

    expect(errorSurfaceOf(error)).not.toContain(SENTINEL);
  });

  it('密文也不出现——密文一样是加密字段值', () => {
    const unit = createUnit({ patch: { secret: RAW_CIPHERTEXT } });

    const error = (() => {
      try {
        assertCommitUnitsEncryptedAtRest(contextWith(isEnvelopeLike), [unit]);
        return undefined;
      } catch (caught: unknown) {
        return caught;
      }
    })();

    const surface = errorSurfaceOf(error);
    expect(surface).not.toContain('deadbeef');
    // `JSON.stringify` 把 Uint8Array 摊成 {"0":222,…}——这正是它进 json 列后的样子。
    expect(surface).not.toContain(JSON.stringify([...RAW_CIPHERTEXT]));
    expect(surface).not.toContain(JSON.stringify({ ...RAW_CIPHERTEXT }));
  });

  it('携带的是身份与位置：namespace / entity / entityId / 列名 / 属性名', () => {
    const unit = createUnit({ patch: { note: SENTINEL } });

    const error = (() => {
      try {
        assertCommitUnitsEncryptedAtRest(contextWith(isEnvelopeLike), [unit]);
        return undefined;
      } catch (caught: unknown) {
        return caught;
      }
    })() as CommitEncryptedAtRestError;

    expect(error.namespace).toBe('app');
    expect(error.entity).toBe('Secret');
    expect(error.entityId).toBe('secret-1');
    expect(error.property).toBe('note');
    expect(error.column).toBe('patch');
  });
});

describe('decodeCommitChangeSetUnit：ChangeSet 行还原成变更单元', () => {
  const stored = encodeWorkingTreePatch(
    bareContext,
    { namespace: 'app', entity: 'Secret' },
    {
      title: 'hello',
      blob: BLOB,
      secret: ENVELOPE
    }
  )!;

  it('走的是同一份 codec：普通 binary 列的信封解回裸字节', () => {
    expect(stored['blob']).toHaveProperty(RXDB_CHANGE_VALUE_ENVELOPE_KEY);

    const unit = decodeCommitChangeSetUnit(bareContext, createRow({ patch: stored }));

    expect(unit.patch?.['blob']).toEqual(BLOB);
    expect(unit.patch?.['title']).toBe('hello');
  });

  it('加密列保持落库形态——核心不解密，那是 US-307 恢复时才发生的事', () => {
    const unit = decodeCommitChangeSetUnit(bareContext, createRow({ patch: stored }));

    expect(unit.patch?.['secret']).toBe(ENVELOPE);
  });

  it('目标实体未注册时原样返回，与 decodeWorkingTreePatch 一致', () => {
    const unit = decodeCommitChangeSetUnit(bareContext, createRow({ entity: 'Ghost', patch: stored }));

    expect(unit.patch).toEqual(stored);
  });

  it('只还原进摘要的那九列，不捏造 fingerprint / baseFingerprint', () => {
    const unit = decodeCommitChangeSetUnit(bareContext, createRow({ patch: stored }));

    expect(Object.keys(unit).sort()).toEqual([
      'entity',
      'entityId',
      'inversePatch',
      'namespace',
      'operation',
      'origin',
      'patch',
      'transactionId',
      'unitId'
    ]);
  });

  it('null 的 patch / inversePatch 保持 null', () => {
    const unit = decodeCommitChangeSetUnit(bareContext, createRow());

    expect(unit.patch).toBeNull();
    expect(unit.inversePatch).toBeNull();
  });

  it('decodeCommitChangeSetUnits 保序', () => {
    const rows = [createRow({ unitId: 'a' }), createRow({ unitId: 'b' }), createRow({ unitId: 'c' })];

    expect(decodeCommitChangeSetUnits(bareContext, rows).map(unit => unit.unitId)).toEqual(['a', 'b', 'c']);
  });
});
