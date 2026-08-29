/**
 * @fileoverview 同步资格判定的权威真值表（RXD-029）
 *
 * 本文件是 `syncType × enabled` 的**唯一**冻结点。此前调度侧散着五份口径：
 * `pullIneligibility` / `pushIneligibility`、`needsPull` / `needsPush`、
 * `pull-batch` 的内联跳过表、`bulk-sync.getRepositoriesToSync` 的内联跳过表、
 * `sync-repository` 的 `shouldPull` / `shouldPush`。它们对 `querycache` 的判断互相矛盾
 * （批量拉它，报表说它没得拉），而 `enabled` 根本没有任何一条调度路径读过。
 *
 * 这里先把矩阵固定，再让所有入口从它派生 —— 谁漂了谁红。
 */

import { describe, expect, it } from 'vitest';
import { SyncType, type SyncOptions } from '../../entity/metadata-options.interface.js';
import type { EntityMetadata } from '../../entity/metadata.interface.js';
import { pullIneligibility, pushIneligibility } from '../../version/cascade-contract.js';
import {
  SYNC_DISABLED_REASON,
  getSyncCapability,
  isNoSync,
  isRepositorySyncEnabled,
  needsOfflineWrite,
  needsPull,
  needsPush,
  type RepositorySyncType
} from '../../version/sync-type-utils.js';

const LOCAL = { adapter: 'sqlite' };
const REMOTE = { adapter: 'supabase' };
/** `SyncType.Filter` 的远端适配器必须带过滤器，否则「按条件同步」无从谈起 */
const FILTER_REMOTE = { adapter: 'supabase', filter: () => ({ combinator: 'and' as const, rules: [] }) };

/** 能稳定推出目标 syncType 的最小 sync 配置（口径见 `getSyncType`） */
const SYNC_CONFIG: Readonly<Record<RepositorySyncType, SyncOptions>> = {
  full: { type: SyncType.Full, local: LOCAL, remote: REMOTE },
  filter: { type: SyncType.Filter, local: LOCAL, remote: FILTER_REMOTE },
  querycache: { type: SyncType.QueryCache, local: LOCAL, remote: REMOTE },
  remote: { type: SyncType.None, remote: REMOTE },
  local: { type: SyncType.None, local: LOCAL },
  // local + remote 齐全但 type = None：显式声明「不同步」（系统表）
  none: { type: SyncType.None, local: LOCAL, remote: REMOTE }
};

const metadataFor = (syncType: RepositorySyncType): EntityMetadata =>
  ({
    name: `Sync${syncType}`,
    namespace: 'public',
    properties: [],
    sync: SYNC_CONFIG[syncType]
  }) as unknown as EntityMetadata;

/**
 * 冻结的能力矩阵
 *
 * `pull` 侧：`querycache` 取 `true` 是**向数据通路对齐**——`pull-batch` 和 `pullRepository`
 * 今天就在拉它，只有报表侧的 `needsPull` 说它不可拉。
 *
 * `push` 与 `offlineWrite` 是**两个正交问题**，`querycache` 正是把它们分开的那一行：
 * - `push` 问「能不能走 `remoteAdapter.mergeChanges` 的 changelog 管道」——
 *   `RxDBAdapterHttp.mergeChanges()` 直接抛 `HttpChangelogUnsupportedError`，故 `false`
 * - `offlineWrite` 问「远端不可达时能不能先落本地、恢复后按 REST 动词重放」——故 `true`
 *
 * `remote` 两条都是 `false`：它压根没有本地存储，离线时没有地方可写。
 */
const MATRIX: ReadonlyArray<{
  syncType: RepositorySyncType;
  pull: boolean;
  push: boolean;
  offlineWrite: boolean;
}> = [
  { syncType: 'full', pull: true, push: true, offlineWrite: true },
  { syncType: 'filter', pull: true, push: true, offlineWrite: true },
  { syncType: 'querycache', pull: true, push: false, offlineWrite: true },
  { syncType: 'remote', pull: true, push: false, offlineWrite: false },
  { syncType: 'local', pull: false, push: false, offlineWrite: false },
  { syncType: 'none', pull: false, push: false, offlineWrite: false }
];

describe('同步资格矩阵（RXD-029）', () => {
  describe('getSyncCapability 冻结 syncType 的能力', () => {
    for (const { syncType, pull, push, offlineWrite } of MATRIX) {
      it(`${syncType}: pull=${pull} push=${push} offlineWrite=${offlineWrite}`, () => {
        expect(getSyncCapability(syncType)).toEqual({ pull, push, offlineWrite });
      });
    }
  });

  describe('所有谓词与矩阵同源', () => {
    for (const { syncType, pull, push, offlineWrite } of MATRIX) {
      it(`${syncType} 的五个入口口径一致`, () => {
        const metadata = metadataFor(syncType);

        // 级联/单仓路径
        expect(pullIneligibility(syncType) === undefined).toBe(pull);
        expect(pushIneligibility(syncType) === undefined).toBe(push);

        // 报表路径：此前 needsPull 把 querycache 判成不可拉，与上面两条相反
        expect(needsPull(metadata)).toBe(pull);
        expect(needsPush(metadata)).toBe(push);
        expect(needsOfflineWrite(metadata)).toBe(offlineWrite);

        // 「完全不同步」= 两个方向都没有能力，且只有 none 满足
        expect(isNoSync(metadata)).toBe(!pull && !push && syncType === 'none');
      });
    }

    it('不具备资格时给出可读原因，且不同方向措辞不冲突', () => {
      expect(pullIneligibility('none')).toBe(`syncType is 'none'`);
      expect(pullIneligibility('local')).toBe(`syncType is 'local' (no remote)`);
      expect(pushIneligibility('remote')).toBe(`syncType is 'remote' (read-only)`);
      // 措辞点名 changelog 而不是「pull-only cache」：querycache 的离线写会经 REST
      // 重放回远端，说成 pull-only 会让读到这句的人以为本地改动根本回不去
      expect(pushIneligibility('querycache')).toBe(
        `syncType is 'querycache' (no changelog endpoint; offline writes replay over REST)`
      );
    });

    it('offlineWrite 与 push 正交：querycache 只有前者', () => {
      // 回推驱动按这两个字段分派，合成一个就没法表达 querycache 这一行
      expect(getSyncCapability('querycache')).toMatchObject({ push: false, offlineWrite: true });
      expect(getSyncCapability('full')).toMatchObject({ push: true, offlineWrite: true });
      expect(getSyncCapability('remote')).toMatchObject({ push: false, offlineWrite: false });
    });
  });

  describe('isRepositorySyncEnabled', () => {
    // 记录是懒创建的（首次同步时才写入，且写入即 enabled = true），
    // 「查不到记录」必须视为启用，否则第一次同步永远被自己挡住。
    it('没有同步记录时视为启用', () => {
      expect(isRepositorySyncEnabled(undefined)).toBe(true);
      expect(isRepositorySyncEnabled(null)).toBe(true);
    });

    it('enabled = true / false 原样生效', () => {
      expect(isRepositorySyncEnabled({ enabled: true })).toBe(true);
      expect(isRepositorySyncEnabled({ enabled: false })).toBe(false);
    });
  });

  describe('enabled = false 一票否决', () => {
    for (const { syncType, pull, push } of MATRIX) {
      it(`${syncType} 被关闭后两个方向都没有资格`, () => {
        const disabled = { enabled: false };

        // syncType 本来就不合格的，原因保持 syncType 的措辞（更具体，先报它）
        expect(pullIneligibility(syncType, disabled)).toBe(pull ? SYNC_DISABLED_REASON : pullIneligibility(syncType));
        expect(pushIneligibility(syncType, disabled)).toBe(push ? SYNC_DISABLED_REASON : pushIneligibility(syncType));
      });
    }

    it('enabled = true 不改变任何判定', () => {
      for (const { syncType } of MATRIX) {
        expect(pullIneligibility(syncType, { enabled: true })).toBe(pullIneligibility(syncType));
        expect(pushIneligibility(syncType, { enabled: true })).toBe(pushIneligibility(syncType));
      }
    });
  });
});
