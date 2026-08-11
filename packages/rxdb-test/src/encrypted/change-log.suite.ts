/**
 * spec 004-local-field-encryption 的 **change log** 契约套件（SC-001 的历史部分）。
 *
 * runner 位于 `packages/rxdb-adapter-wa-sqlite/src/__tests__/encrypted-change-log.spec.ts`
 * 与 `packages/rxdb-adapter-pglite/src/__tests__/encrypted-change-log.spec.ts`。
 *
 * 为什么单独一个套件：`crud.suite.ts` 里那条
 * `leaks zero plaintext sentinels across entity tables + change log + caches`
 * 用的是 `EncryptedUser`，而它设了 `log: false` —— 那张历史表**从头到尾是空的**，
 * 用例名声称覆盖 change log，实际扫的是零字节。adapter 即使把加密列以明文写进
 * `patch` / `inversePatch`，套件照样全绿（RXT-018）。
 *
 * 加密历史走的是和实体行完全不同的编解码路径
 * （`envelopePlaintextPatches` / `unenvelopePlaintextPatches`，见 adapter 的
 * `version/execute_switch_actions.ts` 与 `version/switch-result.utils.ts`），
 * 必须由一个真会写历史的实体（{@link EncryptedAuditedUser}）来覆盖。
 */
import { firstValueFrom } from 'rxjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  ENCRYPTED_SENTINELS,
  EncryptedAuditedUser,
  SENTINEL_API,
  SENTINEL_CC,
  SENTINEL_CC_ROTATED,
  SENTINEL_JSON
} from './fixtures.js';
import type { EncryptedCrudSuiteOptions, EncryptedTestAdapter } from './types.js';

const DEFAULT_PASSPHRASE = 'test-passphrase-2025-encrypted-suite';
const SENTINEL_NUMBER_ARRAY = 9_753_108_642;

/**
 * change log 契约（spec §SC-001，历史部分）。
 *
 * @param options 与 CRUD 套件同一组选项；`readDatabaseFile` 必填 ——
 * 本套件全部结论都建立在它返回的字节视图上。
 */
export function runChangeLogSuite(options: EncryptedCrudSuiteOptions): void {
  const { factory, readDatabaseFile } = options;
  const passphrase = options.passphrase ?? DEFAULT_PASSPHRASE;
  const changeTableName =
    options.resolveTableName?.({ namespace: 'rxdb', tableName: 'rxdb_change' }) ?? `"rxdb$rxdb_change"`;

  const scan = async (adapter: unknown): Promise<ReadonlyArray<string>> => {
    const bytes = await readDatabaseFile(adapter);
    return ENCRYPTED_SENTINELS.filter(sentinel => {
      const needle = new TextEncoder().encode(sentinel);
      const lastStart = bytes.length - needle.length;
      for (let start = 0; start <= lastStart; start += 1) {
        let offset = 0;
        while (offset < needle.length && bytes[start + offset] === needle[offset]) offset += 1;
        if (offset === needle.length) return true;
      }
      return false;
    });
  };

  const scanChanges = async (adapter: EncryptedTestAdapter): Promise<ReadonlyArray<string>> => {
    const result = await adapter.query(
      `SELECT patch, "inversePatch" FROM ${changeTableName} WHERE entity = ? ORDER BY id`,
      ['EncryptedAuditedUser']
    );
    const text = JSON.stringify(result.results);
    return ENCRYPTED_SENTINELS.filter(sentinel => text.includes(sentinel));
  };

  const expectNoPlaintext = async (adapter: EncryptedTestAdapter): Promise<void> => {
    expect(await scan(adapter)).toEqual([]);
    expect(await scanChanges(adapter)).toEqual([]);
  };

  describe(`Encrypted change log [${factory.name}]`, () => {
    let adapter: EncryptedTestAdapter;
    // 绑到 fixture 自己的 id 类型：`RxDBEntityId` 是 `string | number | bigint` 的并集，
    // 比 `EntityBase` 默认的 `UUID` 宽，拿它当局部变量类型会在 `get()` 处报不可赋值。
    let userId: EncryptedAuditedUser['id'];

    // 被审计行的写入放在 `beforeAll`，不放在第一条 `it` 里（RXT-023）。
    // 放在 `it` 里时，下面那条扫描用例消费的是它留下的 `userId` 与那一行历史 ——
    // 单跑扫描用例会拿着 undefined 的 `userId` 去 `get()`，红的是「查询写错」而不是被测缺陷。
    beforeAll(async () => {
      adapter = await factory.createAdapter({ entities: [EncryptedAuditedUser] });
      await adapter.encryption.unlock({ passphrase });

      const user = new EncryptedAuditedUser();
      user.name = 'Audited';
      user.creditCardInfo = SENTINEL_CC;
      user.apiSecret = SENTINEL_API;
      user.metadata = { hidden: SENTINEL_JSON };
      user.tags = [SENTINEL_API, 'initial'];
      user.scores = [SENTINEL_NUMBER_ARRAY, 1];
      user.loginCount = 3;
      user.active = true;
      user.lastSeenAt = new Date('2025-06-01T00:00:00.000Z');
      await user.save();
      userId = user.id;
    });

    afterAll(async () => {
      if (adapter) await adapter.rxdb.disconnectAll();
    });

    // 前提用例。它挡的是本套件自己最可能的失效方式：fixture 的 `log` 被改回 false，
    // 或者 adapter 不再为该实体写历史 —— 那样下面的扫描会扫一张空表并「通过」，
    // 而这正是 RXT-018 描述的那个缺陷本身。写在扫描之前，先证明有东西可扫。
    it('the audited fixture actually produces change log rows (RXT-018 前提)', async () => {
      // 按 `entity` 计数、而不是按 `entityId` 等值查：`entityId` 落盘时是 RxDBEntityId 的
      // 编解码信封（`__rxdb_change_id__:{...,"value":"<uuid>"}`），拿裸 UUID 去比永远为 0 ——
      // 那是查询写错，不是「没有历史」，两者的失败信号长得一模一样。
      const result = await adapter.query(`SELECT COUNT(*) AS c FROM ${changeTableName} WHERE entity = ?`, [
        'EncryptedAuditedUser'
      ]);
      const first = result.results[0];
      expect(Number(first.rows[0][first.columns.indexOf('c')])).toBeGreaterThan(0);
    });

    it('leaks zero JSON/array plaintext through save / update / undo / redo / delete (RAE-006)', async () => {
      await expectNoPlaintext(adapter);

      const saved = await firstValueFrom(EncryptedAuditedUser.get(userId));
      saved.creditCardInfo = SENTINEL_CC_ROTATED;
      saved.metadata = { hidden: SENTINEL_JSON, version: 2 };
      saved.tags = [SENTINEL_API, 'updated'];
      saved.scores = [SENTINEL_NUMBER_ARRAY, 2];
      await saved.save();
      await expectNoPlaintext(adapter);

      const updated = await firstValueFrom(EncryptedAuditedUser.get(userId));
      expect(updated.metadata).toEqual({ hidden: SENTINEL_JSON, version: 2 });
      expect(updated.tags).toEqual([SENTINEL_API, 'updated']);
      expect(updated.scores).toEqual([SENTINEL_NUMBER_ARRAY, 2]);

      await adapter.rxdb.versionManager.history().undo();
      const undone = await firstValueFrom(EncryptedAuditedUser.get(userId));
      expect(undone.metadata).toEqual({ hidden: SENTINEL_JSON });
      expect(undone.tags).toEqual([SENTINEL_API, 'initial']);
      expect(undone.scores).toEqual([SENTINEL_NUMBER_ARRAY, 1]);
      await expectNoPlaintext(adapter);

      await adapter.rxdb.versionManager.history().redo();
      const redone = await firstValueFrom(EncryptedAuditedUser.get(userId));
      expect(redone.metadata).toEqual({ hidden: SENTINEL_JSON, version: 2 });
      expect(redone.tags).toEqual([SENTINEL_API, 'updated']);
      expect(redone.scores).toEqual([SENTINEL_NUMBER_ARRAY, 2]);
      await expectNoPlaintext(adapter);

      const toRemove = await firstValueFrom(EncryptedAuditedUser.get(userId));
      await toRemove.remove();
      await expectNoPlaintext(adapter);
    });
  });
}
