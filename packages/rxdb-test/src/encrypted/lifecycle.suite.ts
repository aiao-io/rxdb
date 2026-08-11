/**
 * spec 004-local-field-encryption 用户故事 3（生命周期锁定）的跨 adapter 契约套件。
 *
 * 校验面向开发者的 `adapter.encryption` 门面行为：
 *  - 锁定时读/写会被 `EncryptedLockedError` 拒绝
 *  - lock/unlock 循环保持加密读写的正确性
 *  - undo/redo 保持加密明文语义
 *  - 没有加密列的数据库上调用门面方法会被
 *    `EncryptedConfigurationError('no_encrypted_columns')` 拒绝
 *
 * 各 runner 位于
 * `packages/rxdb-adapter-{wa-sqlite,pglite}/src/__tests__/encrypted-lifecycle.spec.ts`，
 * 用各自的 adapter factory 调用 `runLifecycleSuite`。
 */
import { Entity, EntityBase, getEntityMetadata, PropertyType } from '@aiao/rxdb';
import { firstValueFrom } from 'rxjs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { expectEncryptedRejection, expectEncryptedThrow } from './error-contract.js';
import { EncryptedUser, SENTINEL_CC } from './fixtures.js';
import type { EncryptedSuiteOptions, EncryptedTestAdapter } from './types.js';

const DEFAULT_PASSPHRASE = 'test-passphrase-2025-encrypted-lifecycle';

const wait = (milliseconds: number): Promise<void> => new Promise(resolve => setTimeout(resolve, milliseconds));

const waitUntilLocked = async (adapter: EncryptedTestAdapter, timeoutMs = 2_000): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (!adapter.encryption.isLocked && Date.now() < deadline) await wait(10);
};

/**
 * 一个不含加密列的普通实体 —— 用于断言 `no_encrypted_columns` 门面契约。
 */
@Entity({
  name: 'PlainEntity',
  tableName: 'plain_entity',
  namespace: 'lifecycle-plain',
  log: false,
  properties: [{ name: 'label', type: PropertyType.string, required: true }]
})
class PlainEntity extends EntityBase {
  label!: string;
}

/**
 * 生命周期契约（spec §FR-005 .. §FR-008，US3 验收场景）。
 *
 * @public
 */
export function runLifecycleSuite(options: EncryptedSuiteOptions): void {
  const { factory } = options;
  const passphrase = options.passphrase ?? DEFAULT_PASSPHRASE;
  void getEntityMetadata(EncryptedUser); // 确保元数据已注册

  describe(`Encrypted lifecycle [${factory.name}]`, () => {
    describe('locked-state rejection', () => {
      let adapter: EncryptedTestAdapter;
      let createdId: string;

      beforeAll(async () => {
        adapter = await factory.createAdapter({ entities: [EncryptedUser] });
        await adapter.encryption.unlock({ passphrase });
        const u = new EncryptedUser();
        u.name = 'lifecycle-locked-fixture';
        u.creditCardInfo = `${SENTINEL_CC}_LOCKED`;
        u.apiSecret = null;
        u.metadata = null;
        u.loginCount = null;
        u.active = null;
        u.lastSeenAt = null;
        await u.save();
        createdId = u.id;
        adapter.encryption.lock();
      });

      afterAll(async () => {
        if (adapter) await adapter.rxdb.disconnectAll();
      });

      it('isLocked is true after lock()', () => {
        expect(adapter.encryption.isLocked).toBe(true);
      });

      it('read while locked rejects with EncryptedLockedError', async () => {
        await expectEncryptedRejection(
          () => firstValueFrom(EncryptedUser.get(createdId as `${string}-${string}-${string}-${string}-${string}`)),
          'locked'
        );
      });

      it('write while locked rejects with EncryptedLockedError', async () => {
        const u = new EncryptedUser();
        u.name = 'lifecycle-locked-write';
        u.creditCardInfo = `${SENTINEL_CC}_LOCKED_WRITE`;
        u.apiSecret = null;
        u.metadata = null;
        u.loginCount = null;
        u.active = null;
        u.lastSeenAt = null;
        await expectEncryptedRejection(() => u.save(), 'locked');
      });
    });

    describe('relock / unlock cycle (FR-008)', () => {
      let adapter: EncryptedTestAdapter;

      beforeAll(async () => {
        adapter = await factory.createAdapter({ entities: [EncryptedUser] });
        await adapter.encryption.unlock({ passphrase });
      });

      afterAll(async () => {
        if (adapter) await adapter.rxdb.disconnectAll();
      });

      it('lock then unlock restores read & write capability', async () => {
        const u1 = new EncryptedUser();
        u1.name = 'cycle-pre-lock';
        u1.creditCardInfo = `${SENTINEL_CC}_CYCLE_1`;
        u1.apiSecret = null;
        u1.metadata = null;
        u1.loginCount = null;
        u1.active = null;
        u1.lastSeenAt = null;
        await u1.save();

        adapter.encryption.lock();
        expect(adapter.encryption.isLocked).toBe(true);

        // 幂等的第二次 lock —— 不抛错。
        adapter.encryption.lock();
        expect(adapter.encryption.isLocked).toBe(true);

        await adapter.encryption.unlock({ passphrase });
        expect(adapter.encryption.isLocked).toBe(false);

        // 重新 unlock 后能解密已有行。
        const reread = await firstValueFrom(EncryptedUser.get(u1.id));
        expect(reread?.creditCardInfo).toBe(`${SENTINEL_CC}_CYCLE_1`);

        // 重新 unlock 后能成功写入新数据。
        const u2 = new EncryptedUser();
        u2.name = 'cycle-post-unlock';
        u2.creditCardInfo = `${SENTINEL_CC}_CYCLE_2`;
        u2.apiSecret = null;
        u2.metadata = null;
        u2.loginCount = null;
        u2.active = null;
        u2.lastSeenAt = null;
        await u2.save();
        const reread2 = await firstValueFrom(EncryptedUser.get(u2.id));
        expect(reread2?.creditCardInfo).toBe(`${SENTINEL_CC}_CYCLE_2`);
      });
    });

    describe('idle timeout lifecycle (FR-005)', () => {
      let adapter: EncryptedTestAdapter;

      beforeAll(async () => {
        adapter = await factory.createAdapter({ entities: [EncryptedUser] });
      });

      beforeEach(() => {
        adapter.encryption.lock();
      });

      afterAll(async () => {
        if (adapter) await adapter.rxdb.disconnectAll();
      });

      it('auto-locks after the configured idle timeout', async () => {
        await adapter.encryption.unlock({ passphrase, idleTimeoutMs: 50 });
        expect(adapter.encryption.isLocked).toBe(false);

        await waitUntilLocked(adapter);

        expect(adapter.encryption.isLocked).toBe(true);
      });

      it('re-arms the idle timeout after successful encrypted activity', async () => {
        await adapter.encryption.unlock({ passphrase, idleTimeoutMs: 1_000 });
        await wait(250);

        const user = new EncryptedUser();
        user.name = 'idle-timeout-activity';
        user.creditCardInfo = `${SENTINEL_CC}_IDLE_ACTIVITY`;
        user.apiSecret = null;
        user.metadata = null;
        user.loginCount = null;
        user.active = null;
        user.lastSeenAt = null;
        await user.save();

        await wait(500);
        expect(adapter.encryption.isLocked).toBe(false);

        await waitUntilLocked(adapter);
        expect(adapter.encryption.isLocked).toBe(true);
      });

      it('keeps the keyring unlocked when idleTimeoutMs is zero', async () => {
        await adapter.encryption.unlock({ passphrase, idleTimeoutMs: 0 });
        await wait(100);

        expect(adapter.encryption.isLocked).toBe(false);
      });
    });

    describe('wrong-passphrase lifecycle (FR-005)', () => {
      let adapter: EncryptedTestAdapter;
      let seededId: string;

      beforeAll(async () => {
        adapter = await factory.createAdapter({ entities: [EncryptedUser] });
        // 先用正确 passphrase 解锁一次，把 verifier 建出来 ——
        // 没有 verifier 的库上「错误 passphrase」无从谈起。
        await adapter.encryption.unlock({ passphrase });
        const seeded = new EncryptedUser();
        seeded.name = 'wrong-passphrase-fixture';
        seeded.creditCardInfo = `${SENTINEL_CC}_WRONG_PASSPHRASE`;
        seeded.apiSecret = null;
        seeded.metadata = null;
        seeded.loginCount = null;
        seeded.active = null;
        seeded.lastSeenAt = null;
        await seeded.save();
        seededId = seeded.id;
        adapter.encryption.lock();
      });

      afterAll(async () => {
        if (adapter) await adapter.rxdb.disconnectAll();
      });

      /**
       * 制造一次失败的 unlock。后两条用例的题面里都写着「after the failed unlock」，
       * 而那次失败此前只发生在**上一条 `it`** 里 —— 单跑时它们照样绿，
       * 绿的却是「库本来就是锁着的」和「正确 passphrase 能解锁」两个恒真命题，
       * 与失败尝试毫无关系（RXT-023）。arrange 归各自所有。
       */
      const failUnlockOnce = async (): Promise<void> => {
        await expectEncryptedRejection(
          () => adapter.encryption.unlock({ passphrase: `${passphrase}-wrong` }),
          'verifier_mismatch'
        );
      };

      it('wrong passphrase rejects with verifier_mismatch and leaves the keyring locked', async () => {
        await failUnlockOnce();
        // 失败的 unlock 必须是**无副作用**的：keyring 不能停在半开状态。
        expect(adapter.encryption.isLocked).toBe(true);
      });

      it('read still rejects with locked after the failed unlock', async () => {
        await failUnlockOnce();
        await expectEncryptedRejection(
          () => firstValueFrom(EncryptedUser.get(seededId as `${string}-${string}-${string}-${string}-${string}`)),
          'locked'
        );
      });

      it('the correct passphrase still recovers after a failed attempt', async () => {
        await failUnlockOnce();
        await adapter.encryption.unlock({ passphrase });
        expect(adapter.encryption.isLocked).toBe(false);

        adapter.rxdb.entityManager.cleanAllCache();
        const reread = await firstValueFrom(
          EncryptedUser.get(seededId as `${string}-${string}-${string}-${string}-${string}`)
        );
        expect(reread?.creditCardInfo).toBe(`${SENTINEL_CC}_WRONG_PASSPHRASE`);
      });
    });

    describe('undo/redo on encrypted columns (FR-006 / FR-008)', () => {
      // 单独启用变更跟踪的实体（规范的 `EncryptedUser` fixture 设置为 `log: false`
      // 以保持 CRUD 套件精简，这样会禁用 `rxdb_change` 触发器，导致 undo/redo 对它无效）。
      @Entity({
        name: 'EncryptedHistoryUser',
        tableName: 'encrypted_history_user',
        namespace: 'lifecycle_encrypted_history',
        properties: [
          { name: 'name', type: PropertyType.string, required: true },
          { name: 'creditCardInfo', type: PropertyType.string, encrypted: true, nullable: true }
        ]
      })
      class EncryptedHistoryUser extends EntityBase {
        name!: string;
        creditCardInfo!: string | null;
      }
      void getEntityMetadata(EncryptedHistoryUser);

      let adapter: EncryptedTestAdapter;
      const ORIGINAL_CC = `${SENTINEL_CC}_UNDO_ORIGINAL`;
      const ROTATED_CC = `${SENTINEL_CC}_UNDO_ROTATED`;

      beforeAll(async () => {
        adapter = await factory.createAdapter({ entities: [EncryptedHistoryUser] });
        await adapter.encryption.unlock({ passphrase });
        await firstValueFrom(adapter.rxdb.versionManager.history(EncryptedHistoryUser).undoHistories$);
      });

      afterAll(async () => {
        if (adapter) await adapter.rxdb.disconnectAll();
      });

      const readFixture = async (userId: string): Promise<EncryptedHistoryUser | undefined> => {
        const rows = await adapter
          .getRepository(EncryptedHistoryUser)
          .find({ where: { combinator: 'and', rules: [] } });
        return rows.find(r => r.id === userId);
      };

      /**
       * undo 与 redo 合成一条，且**自己造数据**（RXT-023）。
       *
       * 两处顺序耦合：
       *
       * 1. 拆成 undo / redo 两条时，redo 那条消费的是 undo 那条留下的历史指针 ——
       *    单跑 redo 时根本没有可 redo 的步骤，行还停在 arrange 写下的 ROTATED，
       *    断言 ROTATED 直接通过，一条完全没走到 redo 路径的绿灯。
       * 2. 造数据放 `beforeAll` 时，`undo while locked` 那条会往同一条 undo 栈上
       *    再压两步（它自己的 create + update）。它先跑，这里的 `history.undo()`
       *    撤销的就是**它**的那一步，本 fixture 纹丝不动停在 ROTATED，
       *    失败信息 `expected 'ROT…' to be 'ORI…'` 指向 FR-006 的解密桥接，
       *    真正的病因却是隔壁用例的副作用（`--sequence.shuffle` 下必现）。
       *
       * undo 的语义是「撤销最近一步」，所以「最近一步是我写的」属于本用例的 arrange，
       * 不能寄存在 `beforeAll` 或另一条 `it` 里。`bigint-binary.suite.ts` 的
       * `restores bigint and binary runtime types through undo and redo` 早就是这个写法。
       */
      it('undo restores original plaintext and redo re-applies the rotated value', async () => {
        const history = adapter.rxdb.versionManager.history(EncryptedHistoryUser);

        const u = new EncryptedHistoryUser();
        u.name = 'undo-redo-fixture';
        u.creditCardInfo = ORIGINAL_CC;
        await u.save();
        const userId = u.id;

        // 旋转加密列以制造一步可 undo 的变更 —— 必须是栈顶那一步。
        u.creditCardInfo = ROTATED_CC;
        await u.save();

        // arrange 的后果先钉住：没有这一步，下面的 redo 断言会退化成恒真。
        expect((await readFixture(userId))?.creditCardInfo).toBe(ROTATED_CC);

        await history.undo();
        // 解密后的值必须等于旋转前的明文。
        // 如果 switch-result 路径把信封原样存回去，值会读成 ROTATED（双重加密会破坏回环，得到 ROTATED）。
        // 还原到 ORIGINAL 才能证明「先解密再加密」桥接（FR-006）有效。
        expect((await readFixture(userId))?.creditCardInfo).toBe(ORIGINAL_CC);

        await history.redo();
        expect((await readFixture(userId))?.creditCardInfo).toBe(ROTATED_CC);
      });

      it('undo while locked rejects with EncryptedLockedError', async () => {
        const history = adapter.rxdb.versionManager.history(EncryptedHistoryUser);
        // 再制造一步可 undo 的变更，确保存在待撤销的行。
        const u = new EncryptedHistoryUser();
        u.name = 'lock-undo-fixture';
        u.creditCardInfo = `${SENTINEL_CC}_LOCK_A`;
        await u.save();
        u.creditCardInfo = `${SENTINEL_CC}_LOCK_B`;
        await u.save();

        adapter.encryption.lock();
        await expectEncryptedRejection(() => history.undo(), 'locked');
        await adapter.encryption.unlock({ passphrase });
      });
    });

    describe('facade on DB with no encrypted columns', () => {
      let adapter: EncryptedTestAdapter;

      beforeAll(async () => {
        adapter = await factory.createAdapter({ entities: [PlainEntity] });
      });

      afterAll(async () => {
        if (adapter) await adapter.rxdb.disconnectAll();
      });

      it('unlock throws EncryptedConfigurationError(no_encrypted_columns)', async () => {
        await expectEncryptedRejection(() => adapter.encryption.unlock({ passphrase }), 'no_encrypted_columns');
      });

      it('lock throws EncryptedConfigurationError(no_encrypted_columns)', () => {
        expectEncryptedThrow(() => adapter.encryption.lock(), 'no_encrypted_columns');
      });

      it('isLocked throws EncryptedConfigurationError(no_encrypted_columns)', () => {
        expectEncryptedThrow(() => adapter.encryption.isLocked, 'no_encrypted_columns');
      });
    });
  });
}
