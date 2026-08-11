/**
 * spec 004-local-field-encryption 用户故事 2（AAD 防篡改）的跨 adapter 契约套件。
 *
 * 跨 adapter 验证 AAD 绑定 `namespace + tableName + columnName + primaryKey`，
 * 使跨命名空间 / 跨表 / 跨列 / 跨行信封互换在解密时抛 `EncryptedDecryptError`。
 * 当前单 kid keyring 会先以 `unknown_kid` 拒绝不匹配的 kid；kid 改变 AAD 字节的契约
 * 由 `rxdb-adapter-encrypted/src/envelope.spec.ts` 直接证明，不为测试引入多 kid 轮转能力。
 * 还验证批量读取在某个信封非法时会拒绝返回部分行。
 *
 * runner 位于
 * `packages/rxdb-adapter-{wa-sqlite,pglite}/src/__tests__/encrypted-tamper.spec.ts`，
 * 用各自的 adapter factory 与 `resolveTableName` 辅助函数调用 `runTamperSuite`。
 * 套件仅触及用于原始信封篡改的 `adapter.query(...)` 与面向开发的 Repository 读路径。
 */
import { Entity, EntityBase, getEntityMetadata, PropertyType } from '@aiao/rxdb';
import { firstValueFrom } from 'rxjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { expectEncryptedRejection } from './error-contract.js';
import { EncryptedUser, SENTINEL_API, SENTINEL_CC } from './fixtures.js';
import { withTemporaryValue } from './temporary-value.js';
import type { EncryptedSuiteOptions, EncryptedTestAdapter } from './types.js';

const DEFAULT_PASSPHRASE = 'test-passphrase-2025-encrypted-suite';

/**
 * 与 {@link EncryptedUser} 列结构逐字相同、**只差 `tableName`** 的夹具。
 *
 * 存在的唯一理由：套件此前只有跨行（差 `primaryKey`）与跨列（差 `columnName`）互换，
 * 于是 `tableName` / `entityNamespace` 参与 AAD 这两项在跨 adapter 层面**从未被证明**
 * （RXT-020）。要证明差的就是 `tableName`，其余五个 AAD 分量必须全部相等 ——
 * 包括 `primaryKey`，所以下面的用例会用原始 SQL 把目标行的 id 改成源行的 id。
 *
 * 刻意不放进 `fixtures.ts`：那个文件被 `index.ts` 整体 `export *`，
 * 加进去会动 `public-contract/baseline.json`。这两个夹具只服务本套件。
 */
@Entity({
  name: 'EncryptedTamperTableSwap',
  tableName: 'encrypted_tamper_table_swap',
  namespace: 'encrypted-fixtures',
  log: false,
  properties: [
    { name: 'name', type: PropertyType.string, required: true },
    { name: 'creditCardInfo', type: PropertyType.string, encrypted: true, nullable: true },
    { name: 'apiSecret', type: PropertyType.string, encrypted: true, nullable: true }
  ]
})
class EncryptedTamperTableSwap extends EntityBase {
  name!: string;
  creditCardInfo!: string | null;
  apiSecret!: string | null;
}

/**
 * 与 {@link EncryptedTamperTableSwap} 同 `tableName`、**只差 `namespace`** 的夹具。
 *
 * 两者物理上是不同的表（wa-sqlite `"ns$table"`、PGlite `"ns"."table"`），
 * 因此可以在两张表里放同一个 id，把差异收敛到 AAD 的 `entityNamespace` 一项。
 */
@Entity({
  name: 'EncryptedTamperNamespaceSwap',
  tableName: 'encrypted_tamper_table_swap',
  namespace: 'encrypted-fixtures-alt',
  log: false,
  properties: [
    { name: 'name', type: PropertyType.string, required: true },
    { name: 'creditCardInfo', type: PropertyType.string, encrypted: true, nullable: true },
    { name: 'apiSecret', type: PropertyType.string, encrypted: true, nullable: true }
  ]
})
class EncryptedTamperNamespaceSwap extends EntityBase {
  name!: string;
  creditCardInfo!: string | null;
  apiSecret!: string | null;
}

type UuidLike = `${string}-${string}-${string}-${string}-${string}`;

const asUuid = (id: string): UuidLike => id as UuidLike;

async function readCell(adapter: EncryptedTestAdapter, tableName: string, column: string, id: string): Promise<string> {
  const res = await adapter.query(`SELECT ${column} FROM ${tableName} WHERE id = ?`, [id]);
  const rows = res.results[0]?.rows ?? [];
  if (rows.length !== 1) throw new Error(`expected one row for id=${id}, got ${rows.length}`);
  const value = rows[0][0];
  if (typeof value !== 'string') throw new Error(`expected envelope string, got ${typeof value}`);
  return value;
}

async function overwriteCell(
  adapter: EncryptedTestAdapter,
  tableName: string,
  column: string,
  id: string,
  envelope: string
): Promise<void> {
  await adapter.query(`UPDATE ${tableName} SET ${column} = ? WHERE id = ?`, [envelope, id]);
}

/** 替换指定段的某个 base64url 字符，让 AES-GCM 鉴权失败。 */
function flipSegment(envelope: string, segmentIndex: number): string {
  const parts = envelope.split('|');
  if (parts.length !== 6) throw new Error(`expected 6 segments, got ${parts.length}`);
  const seg = parts[segmentIndex];
  if (seg.length === 0) throw new Error(`segment ${segmentIndex} is empty`);
  // 在 'A' 与 'B' 之间切换首字符（两者都是合法的 base64url），
  // 保持长度派生的结构（iv 12、tag 16）不变。
  const first = seg[0];
  const replacement = first === 'A' ? 'B' : 'A';
  parts[segmentIndex] = replacement + seg.slice(1);
  return parts.join('|');
}

/**
 * 防篡改契约（spec §FR-003、§FR-007、SC-003）。
 *
 * @public
 */
export function runTamperSuite(options: EncryptedSuiteOptions): void {
  const { factory } = options;
  const passphrase = options.passphrase ?? DEFAULT_PASSPHRASE;
  const resolve = (entity: Parameters<typeof getEntityMetadata>[0]): string => {
    const meta = getEntityMetadata(entity);
    return (
      options.resolveTableName?.({ namespace: meta.namespace, tableName: meta.tableName }) ??
      `"${meta.namespace}$${meta.tableName}"`
    );
  };
  const tableName = resolve(EncryptedUser);
  const tableSwapTable = resolve(EncryptedTamperTableSwap);
  const namespaceSwapTable = resolve(EncryptedTamperNamespaceSwap);

  describe(`Encrypted tamper resistance [${factory.name}]`, () => {
    let adapter: EncryptedTestAdapter;
    let rowA: EncryptedUser;
    let rowB: EncryptedUser;

    beforeAll(async () => {
      adapter = await factory.createAdapter({
        entities: [EncryptedUser, EncryptedTamperTableSwap, EncryptedTamperNamespaceSwap]
      });
      await adapter.encryption.unlock({ passphrase });

      rowA = new EncryptedUser();
      rowA.name = 'tamper-A';
      rowA.creditCardInfo = `${SENTINEL_CC}_A`;
      rowA.apiSecret = `${SENTINEL_API}_A`;
      rowA.metadata = null;
      rowA.loginCount = null;
      rowA.active = null;
      rowA.lastSeenAt = null;
      await rowA.save();

      rowB = new EncryptedUser();
      rowB.name = 'tamper-B';
      rowB.creditCardInfo = `${SENTINEL_CC}_B`;
      rowB.apiSecret = `${SENTINEL_API}_B`;
      rowB.metadata = null;
      rowB.loginCount = null;
      rowB.active = null;
      rowB.lastSeenAt = null;
      await rowB.save();
    });

    afterAll(async () => {
      if (adapter) await adapter.rxdb.disconnectAll();
    });

    /**
     * 对信封打快照、应用篡改、断言被拒，再用原始 SQL 恢复。
     * 如果改用公开 API 修复，Repository 内存中的等值判断会让 `save()` 短路，
     * 所以用原始恢复保持测试独立。
     */
    async function withTamper(
      id: string,
      column: 'creditCardInfo' | 'apiSecret',
      tampered: string,
      expectedCode: string,
      readTargetId: string = id
    ): Promise<void> {
      await withTemporaryValue(
        () => readCell(adapter, tableName, column, id),
        envelope => overwriteCell(adapter, tableName, column, id, envelope),
        tampered,
        async () => {
          await expectEncryptedRejection(() => firstValueFrom(EncryptedUser.get(asUuid(readTargetId))), expectedCode);
        }
      );
    }

    it('cross-row swap fails with auth_failure', async () => {
      const envA = await readCell(adapter, tableName, 'creditCardInfo', rowA.id);
      await withTamper(rowB.id, 'creditCardInfo', envA, 'auth_failure', rowB.id);
    });

    it('cross-column swap fails with auth_failure', async () => {
      const apiA = await readCell(adapter, tableName, 'apiSecret', rowA.id);
      await withTamper(rowA.id, 'creditCardInfo', apiA, 'auth_failure');
    });

    /**
     * 在 `table` 里造一行、把它的 id 原始改写成 `sharedId`，再**先证明这行本身能正常
     * 加解密**，然后才贴入外来信封。
     *
     * 中间那步控制不是仪式：id 是原始 SQL 改的，如果这条路本身就让读取炸掉，
     * 后面的 `auth_failure` 会红得很像样却证明不了任何事（红了不等于红对了）。
     * 只有「同表同 id 自己写的信封读得回来」成立，随后的失败才唯一归因于
     * `tableName` / `entityNamespace` 参与 AAD。
     */
    async function seedSwapRowSharingId(
      entity: typeof EncryptedTamperTableSwap | typeof EncryptedTamperNamespaceSwap,
      table: string,
      sharedId: string
    ): Promise<void> {
      const seeded = new entity();
      seeded.name = 'swap-target';
      // 只留 `creditCardInfo` 一个信封位，且先置空：其余加密列若带着旧 id 的信封，
      // 读取时会先于被测列抛错，失败原因就不再唯一。
      seeded.creditCardInfo = null;
      seeded.apiSecret = null;
      await seeded.save();

      await adapter.query(`UPDATE ${table} SET id = ? WHERE id = ?`, [sharedId, seeded.id]);
      adapter.rxdb.entityManager.cleanAllCache();

      const moved = await firstValueFrom(entity.get(asUuid(sharedId)));
      moved.creditCardInfo = 'rig-control-plaintext';
      await moved.save();
      adapter.rxdb.entityManager.cleanAllCache();

      const reread = await firstValueFrom(entity.get(asUuid(sharedId)));
      expect(reread.creditCardInfo).toBe('rig-control-plaintext');
    }

    it('cross-table swap fails with auth_failure (RXT-020)', async () => {
      // 与 `EncryptedUser` 的差异**只有 tableName**：namespace、columnName、
      // primaryKey、kid 全部相同。
      const envA = await readCell(adapter, tableName, 'creditCardInfo', rowA.id);
      await seedSwapRowSharingId(EncryptedTamperTableSwap, tableSwapTable, rowA.id);

      await overwriteCell(adapter, tableSwapTable, 'creditCardInfo', rowA.id, envA);
      adapter.rxdb.entityManager.cleanAllCache();

      await expectEncryptedRejection(
        () => firstValueFrom(EncryptedTamperTableSwap.get(asUuid(rowA.id))),
        'auth_failure'
      );
    });

    it('cross-namespace swap fails with auth_failure (RXT-020)', async () => {
      // 与上一条的来源表同名（`encrypted_tamper_table_swap`），差异**只有 namespace**。
      const donorId = rowB.id;
      await seedSwapRowSharingId(EncryptedTamperTableSwap, tableSwapTable, donorId);
      await seedSwapRowSharingId(EncryptedTamperNamespaceSwap, namespaceSwapTable, donorId);

      const donorEnvelope = await readCell(adapter, tableSwapTable, 'creditCardInfo', donorId);
      await overwriteCell(adapter, namespaceSwapTable, 'creditCardInfo', donorId, donorEnvelope);
      adapter.rxdb.entityManager.cleanAllCache();

      await expectEncryptedRejection(
        () => firstValueFrom(EncryptedTamperNamespaceSwap.get(asUuid(donorId))),
        'auth_failure'
      );
    });

    it('byte-flip in ciphertext segment fails with auth_failure', async () => {
      const env = await readCell(adapter, tableName, 'creditCardInfo', rowA.id);
      await withTamper(rowA.id, 'creditCardInfo', flipSegment(env, 4), 'auth_failure');
    });

    it('byte-flip in tag segment fails with auth_failure', async () => {
      const env = await readCell(adapter, tableName, 'creditCardInfo', rowA.id);
      await withTamper(rowA.id, 'creditCardInfo', flipSegment(env, 5), 'auth_failure');
    });

    it('byte-flip in iv segment fails with auth_failure', async () => {
      const env = await readCell(adapter, tableName, 'creditCardInfo', rowA.id);
      await withTamper(rowA.id, 'creditCardInfo', flipSegment(env, 3), 'auth_failure');
    });

    it('unknown envelope version fails with unsupported_version', async () => {
      const env = await readCell(adapter, tableName, 'creditCardInfo', rowA.id);
      const parts = env.split('|');
      parts[0] = '3';
      await withTamper(rowA.id, 'creditCardInfo', parts.join('|'), 'unsupported_version');
    });

    it('unknown algorithm fails with unsupported_algorithm', async () => {
      const env = await readCell(adapter, tableName, 'creditCardInfo', rowA.id);
      const parts = env.split('|');
      parts[1] = 'XCHACHA20';
      await withTamper(rowA.id, 'creditCardInfo', parts.join('|'), 'unsupported_algorithm');
    });

    it('mismatched kid fails with unknown_kid', async () => {
      const env = await readCell(adapter, tableName, 'creditCardInfo', rowA.id);
      const parts = env.split('|');
      // base64url，8 字节随机数 → 11 个字符（无填充）。
      parts[2] = 'AAAAAAAAAAA';
      await withTamper(rowA.id, 'creditCardInfo', parts.join('|'), 'unknown_kid');
    });

    it('malformed envelope (wrong segment count) fails with malformed_envelope', async () => {
      await withTamper(rowA.id, 'creditCardInfo', 'not|enough|segments', 'malformed_envelope');
    });

    it('partial-failure: findMany batch with one tampered row rejects entire batch (no partial rows)', async () => {
      // 插入 5 行使用不同哨兵的种子数据，便于检测部分泄漏。
      const ids: string[] = [];
      for (let i = 0; i < 5; i++) {
        const u = new EncryptedUser();
        u.name = `partial_${i}`;
        u.creditCardInfo = `partial_card_${i}`;
        u.apiSecret = null;
        u.metadata = null;
        u.loginCount = null;
        u.active = null;
        u.lastSeenAt = null;
        await u.save();
        ids.push(u.id);
      }

      const id = ids[2];
      const original = await readCell(adapter, tableName, 'creditCardInfo', id);
      await withTemporaryValue(
        async () => original,
        envelope => overwriteCell(adapter, tableName, 'creditCardInfo', id, envelope),
        flipSegment(original, 4),
        async () => {
          await expectEncryptedRejection(
            () =>
              firstValueFrom(
                EncryptedUser.find({
                  where: {
                    combinator: 'and',
                    rules: [{ field: 'name', operator: 'contains', value: 'partial_' }]
                  }
                })
              ),
            'auth_failure'
          );
        }
      );
    });
  });
}
