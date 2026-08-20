/**
 * @fileoverview 契约测试：`VersionManager` 的仓库级同步 API（RXD-040）
 *
 * 取代五个「自证」文件：`check-repository-updates` / `get-repository-sync-status` /
 * `get-all-repository-sync-status` / `bulk-sync` / `sync-repository`（合计 2626 行）。
 * 那五个文件各自**重新声明**了一份 `RepositoryIdentifier` / `RepositorySyncStatus` /
 * `BulkSyncOptions` 等，再拿手搓字面量去断言自己那份抄件；唯一碰到生产代码的地方是
 * `expect(typeof versionManager.X).toBe('function')`。生产签名怎么漂，它们都是绿的。
 *
 * 这里两条都不抄：
 *
 * 1. **类型只从公开入口取。** by-name 导出的直接 `import from '../../index.js'`；
 *    `BulkSyncOptions` / `RepositorySyncStatus` 等没有 by-name 导出的，从
 *    `RxDB['versionManager']` 的方法签名反推——那正是消费者唯一能拿到它们的路径。
 *    断言用 `expectTypeOf` / `@ts-expect-error`，vitest 运行时是 no-op，真正执行它们的是
 *    `tsc -p tsconfig.spec.json --noEmit`：签名再漂就是编译错误，不是绿灯。
 * 2. **行为断言穿真实 `RxDB` + 真实 `VersionManager`**（`createTestDB()`），不打桩任何一层。
 *    键集合断言把「接口声明了什么」和「运行时真的返回了什么」焊在一起：production 加了字段
 *    却不填、或填了却没进接口，两边任一都会红。
 *
 * 各入口的算法分支覆盖不在这里，在 `src/__tests__/version/`（`check-repository-updates.spec.ts`
 * 等直接 import 生产函数跑）。本文件只负责「对外承诺的形状」这一层，不重复。
 */

import { beforeAll, describe, expect, expectTypeOf, it } from 'vitest';
import type {
  CheckRepositoryUpdatesResult,
  PullRepositoryOptions,
  PullRepositoryResult,
  PushRepositoryOptions,
  PushRepositoryResult,
  RepositoryIdentifier,
  RxDB,
  SyncRepositoryOptions,
  SyncRepositoryResult
} from '../../index.js';
import { createTestDB } from '../fixtures/test-db-setup.js';

type VersionManagerApi = RxDB['versionManager'];

// `bulk-sync.ts` / `get-repository-sync-status.ts` / `get-all-repository-sync-status.ts`
// 都没有从 `src/index.ts` 导出。消费者只能经 `rxdb.versionManager` 这条公开路径看到它们，
// 所以这里也只从方法签名反推——反推得到的就是消费者手上的全部信息。
// （删掉的五个文件是反过来做的：自己抄一份，于是抄件和生产各活各的。）
type BulkSyncOptions = NonNullable<Parameters<VersionManagerApi['bulkSync']>[0]>;
type BulkSyncResult = Awaited<ReturnType<VersionManagerApi['bulkSync']>>;
type RepositorySyncStatus = Awaited<ReturnType<VersionManagerApi['getRepositorySyncStatus']>>;
type GetAllRepositorySyncStatusFilter = NonNullable<Parameters<VersionManagerApi['getAllRepositorySyncStatus']>[0]>;
type SyncTypeValue = RepositorySyncStatus['syncType'];

// 下面三个 `as const` 数组同时被类型断言和运行时断言使用，这是本文件的关键接缝：
// 类型侧固定 `keyof`，运行时侧固定 `Object.keys()`，两侧对同一个常量。
const STATUS_KEYS = [
  'repository',
  'branchId',
  'syncType',
  'enabled',
  'lastPushedChangeId',
  'lastPushedAt',
  'lastPulledAt',
  'lastPullRemoteChangeId',
  'pushableCount',
  'pullableCount'
] as const;

const CHECK_KEYS = [
  'repository',
  'remoteLatestChangeId',
  'localLastPullRemoteChangeId',
  'pendingCount',
  'hasUpdates'
] as const;

const BULK_RESULT_KEYS = ['succeeded', 'failed', 'results', 'durationMs'] as const;

const SYNC_TYPE_VALUES = ['full', 'filter', 'querycache', 'remote', 'local', 'none'] as const;

const USER: RepositoryIdentifier = { namespace: 'public', entity: 'User' };

const sortedKeys = (value: object): string[] => Object.keys(value).sort();
const sorted = (values: readonly string[]): string[] => [...values].sort();

describe('VersionManager 仓库级同步 API 公开契约', () => {
  describe('入口签名（由 tsconfig.spec.json --noEmit 强制，vitest 运行时是 no-op）', () => {
    it('七个入口的参数与返回值逐个钉死在公开导出的类型上', () => {
      expectTypeOf<VersionManagerApi['pullRepository']>().toEqualTypeOf<
        (namespace: string, entity: string, options?: PullRepositoryOptions) => Promise<PullRepositoryResult>
      >();
      expectTypeOf<VersionManagerApi['pushRepository']>().toEqualTypeOf<
        (namespace: string, entity: string, options?: PushRepositoryOptions) => Promise<PushRepositoryResult>
      >();
      expectTypeOf<VersionManagerApi['syncRepository']>().toEqualTypeOf<
        (namespace: string, entity: string, options?: SyncRepositoryOptions) => Promise<SyncRepositoryResult>
      >();
      expectTypeOf<VersionManagerApi['checkRepositoryUpdates']>().toEqualTypeOf<
        (namespace: string, entity: string) => Promise<CheckRepositoryUpdatesResult>
      >();
      expectTypeOf<VersionManagerApi['getRepositorySyncStatus']>().toEqualTypeOf<
        (namespace: string, entity: string) => Promise<RepositorySyncStatus>
      >();
      expectTypeOf<VersionManagerApi['getAllRepositorySyncStatus']>().toEqualTypeOf<
        (filter?: GetAllRepositorySyncStatusFilter) => Promise<RepositorySyncStatus[]>
      >();
      expectTypeOf<VersionManagerApi['bulkSync']>().toEqualTypeOf<
        (options?: BulkSyncOptions) => Promise<BulkSyncResult>
      >();
    });

    it('没有 by-name 导出的四个形状，成员仍然钉死（含它们对公开 RepositoryIdentifier 的引用）', () => {
      expectTypeOf<(typeof STATUS_KEYS)[number]>().toEqualTypeOf<keyof RepositorySyncStatus>();
      expectTypeOf<RepositorySyncStatus['repository']>().toEqualTypeOf<RepositoryIdentifier>();
      expectTypeOf<RepositorySyncStatus['branchId']>().toEqualTypeOf<string>();
      expectTypeOf<RepositorySyncStatus['enabled']>().toEqualTypeOf<boolean>();
      expectTypeOf<RepositorySyncStatus['lastPushedChangeId']>().toEqualTypeOf<number | null>();
      expectTypeOf<RepositorySyncStatus['lastPushedAt']>().toEqualTypeOf<Date | null>();
      expectTypeOf<RepositorySyncStatus['lastPulledAt']>().toEqualTypeOf<Date | null>();
      expectTypeOf<RepositorySyncStatus['lastPullRemoteChangeId']>().toEqualTypeOf<number | null>();
      expectTypeOf<RepositorySyncStatus['pushableCount']>().toEqualTypeOf<number>();
      expectTypeOf<RepositorySyncStatus['pullableCount']>().toEqualTypeOf<number>();

      expectTypeOf<(typeof SYNC_TYPE_VALUES)[number]>().toEqualTypeOf<SyncTypeValue>();

      expectTypeOf<(typeof CHECK_KEYS)[number]>().toEqualTypeOf<keyof CheckRepositoryUpdatesResult>();
      expectTypeOf<CheckRepositoryUpdatesResult['repository']>().toEqualTypeOf<RepositoryIdentifier>();
      expectTypeOf<CheckRepositoryUpdatesResult['remoteLatestChangeId']>().toEqualTypeOf<number>();
      expectTypeOf<CheckRepositoryUpdatesResult['localLastPullRemoteChangeId']>().toEqualTypeOf<number | null>();
      expectTypeOf<CheckRepositoryUpdatesResult['hasUpdates']>().toEqualTypeOf<boolean>();

      expectTypeOf<(typeof BULK_RESULT_KEYS)[number]>().toEqualTypeOf<keyof BulkSyncResult>();
      expectTypeOf<BulkSyncResult['results'][number]>().toEqualTypeOf<{
        repository: RepositoryIdentifier;
        success: boolean;
        result?: SyncRepositoryResult;
        error?: Error;
      }>();

      expectTypeOf<keyof BulkSyncOptions>().toEqualTypeOf<
        'operation' | 'repositories' | 'pull' | 'push' | 'concurrent' | 'concurrency'
      >();
      expectTypeOf<BulkSyncOptions['operation']>().toEqualTypeOf<'pull' | 'push' | 'sync' | undefined>();
      expectTypeOf<BulkSyncOptions['repositories']>().toEqualTypeOf<RepositoryIdentifier[] | undefined>();
      expectTypeOf<BulkSyncOptions['pull']>().toEqualTypeOf<PullRepositoryOptions | undefined>();
      expectTypeOf<BulkSyncOptions['push']>().toEqualTypeOf<PushRepositoryOptions | undefined>();

      expectTypeOf<keyof GetAllRepositorySyncStatusFilter>().toEqualTypeOf<
        'syncType' | 'enabled' | 'hasPendingChanges'
      >();
      expectTypeOf<GetAllRepositorySyncStatusFilter['syncType']>().toEqualTypeOf<SyncTypeValue[] | undefined>();
    });

    it('少参数、错字面量、多字段一律拒收（负编译）', () => {
      const versionManager = {} as VersionManagerApi;

      // 只做类型检查，永不执行——这些调用如果真跑起来会炸。
      const rejected = () => {
        // @ts-expect-error 仓库级入口一律 (namespace, entity)，不接受单个 'namespace:entity'
        versionManager.pullRepository('public:User');
        // @ts-expect-error 同上，checkRepositoryUpdates 也要 (namespace, entity)
        versionManager.checkRepositoryUpdates('public:User');
        // @ts-expect-error syncType 是数组，不是单值
        versionManager.getAllRepositorySyncStatus({ syncType: 'full' });
        // @ts-expect-error 'partial' 不在 SyncTypeValue 里
        versionManager.getAllRepositorySyncStatus({ syncType: ['partial'] });
        // @ts-expect-error filter 没有 namespace 这一维
        versionManager.getAllRepositorySyncStatus({ namespace: 'public' });
        // @ts-expect-error operation 只有 pull | push | sync
        versionManager.bulkSync({ operation: 'merge' });
        // @ts-expect-error repositories 元素是 { namespace, entity }，不是字符串
        versionManager.bulkSync({ repositories: ['public:User'] });
      };

      expect(typeof rejected).toBe('function');
    });

    it('RepositoryIdentifier 只有 namespace + entity（负编译）', () => {
      const identifier: RepositoryIdentifier = { namespace: 'public', entity: 'User' };

      // @ts-expect-error 少了 entity
      const missingEntity: RepositoryIdentifier = { namespace: 'public' };
      // @ts-expect-error 没有 branchId 这一维——分支是 VersionManager 的当前状态，不是标识符的一部分
      const extraBranch: RepositoryIdentifier = { namespace: 'public', entity: 'User', branchId: 'main' };

      expect(sortedKeys(identifier)).toEqual(['entity', 'namespace']);
      expect(missingEntity.entity).toBeUndefined();
      expect(extraBranch.namespace).toBe('public');
    });
  });

  describe('真实 RxDB + 真实 VersionManager 的返回形状', () => {
    let versionManager: VersionManagerApi;

    beforeAll(async () => {
      const { rxdb } = await createTestDB();
      versionManager = rxdb.versionManager;
    });

    it('getAllRepositorySyncStatus 每一项的运行时键集合与声明的 keyof 一致', async () => {
      const statuses = await versionManager.getAllRepositorySyncStatus();

      expect(statuses.length).toBeGreaterThan(0);
      statuses.forEach(status => {
        expect(sortedKeys(status)).toEqual(sorted(STATUS_KEYS));
        expect(sortedKeys(status.repository)).toEqual(['entity', 'namespace']);
        expect(SYNC_TYPE_VALUES).toContain(status.syncType);
      });
    });

    it('用户实体和 rxdb 系统实体都在结果里（不是只枚举 config.entities）', async () => {
      const statuses = await versionManager.getAllRepositorySyncStatus();
      const ids = statuses.map(status => `${status.repository.namespace}:${status.repository.entity}`);

      expect(ids).toContain('public:User');
      expect(ids).toContain('rxdb:RxDBChange');
    });

    it('filter 真的被消费：syncType 命中返回全集，未命中返回空', async () => {
      const all = await versionManager.getAllRepositorySyncStatus();
      const actual = [...new Set(all.map(status => status.syncType))];
      const absent = SYNC_TYPE_VALUES.filter(value => !actual.includes(value));

      await expect(versionManager.getAllRepositorySyncStatus({ syncType: actual })).resolves.toHaveLength(all.length);
      await expect(versionManager.getAllRepositorySyncStatus({ syncType: absent })).resolves.toEqual([]);
    });

    it('getRepositorySyncStatus 与 getAllRepositorySyncStatus 对同一仓库给出同一结果', async () => {
      const single = await versionManager.getRepositorySyncStatus(USER.namespace, USER.entity);
      const all = await versionManager.getAllRepositorySyncStatus();
      const fromAll = all.find(status => status.repository.entity === USER.entity);

      expect(single.repository).toEqual(USER);
      expect(single).toEqual(fromAll);
    });

    it('checkRepositoryUpdates 的运行时键集合与声明一致，且 hasUpdates 由 pendingCount 推出', async () => {
      const result = await versionManager.checkRepositoryUpdates(USER.namespace, USER.entity);

      expect(sortedKeys(result)).toEqual(sorted(CHECK_KEYS));
      expect(result.repository).toEqual(USER);
      expect(result.hasUpdates).toBe(result.pendingCount > 0);
    });

    it('bulkSync 的结果按输入仓库逐条回填，且 succeeded + failed 等于条目数', async () => {
      const result = await versionManager.bulkSync({ repositories: [USER] });

      expect(sortedKeys(result)).toEqual(sorted(BULK_RESULT_KEYS));
      expect(result.results.map(entry => entry.repository)).toEqual([USER]);
      expect(result.succeeded + result.failed).toBe(result.results.length);
      expect(typeof result.durationMs).toBe('number');
    });

    it('bulkSync 成功条目带回完整的 SyncRepositoryResult（pull + push 两半都在）', async () => {
      const result = await versionManager.bulkSync({ repositories: [USER] });
      const [entry] = result.results;

      expect(entry.success).toBe(true);
      expect(entry.error).toBeUndefined();
      expect(entry.result?.pullResult.repository).toEqual(USER);
      expect(entry.result?.pushResult.repository).toEqual(USER);
    });

    it('不存在的仓库在单条入口上抛错，在 bulkSync 里降级为 failed 条目', async () => {
      await expect(versionManager.getRepositorySyncStatus('public', 'Missing')).rejects.toThrow();

      const result = await versionManager.bulkSync({ repositories: [{ namespace: 'public', entity: 'Missing' }] });

      expect(result.failed).toBe(1);
      expect(result.succeeded).toBe(0);
      expect(result.results[0].success).toBe(false);
      expect(result.results[0].error).toBeInstanceOf(Error);
    });
  });
});
