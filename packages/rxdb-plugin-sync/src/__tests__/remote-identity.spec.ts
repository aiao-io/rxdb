/**
 * @fileoverview 与远端交换数据之前核对调用者身份（US-035 AC#6、AC#7 的同步一侧）。
 *
 * @remarks
 * 身份核对与远端身份核对（`RemoteBackendMismatchError`）共用同一批入口：同步插件的每个入口一进门、
 * 拉回的每一轮落库之前、推送回执落库之前，都经 `bindRemoteBackend` → `assertRemoteBackend`。
 * 所以这里只钉两件事：
 *
 * 1. 身份核对排在**一切远端请求之前**——对不上时连 `backendId()` 都不能发；
 * 2. 对不上的错误同时写进 `SyncState.lastError`，面板上看得见。
 *
 * 宿主用真实的 `RxDB`（不连接）：`assertCallerIdentity` 是核心的方法，换成替身就测不到它。
 */

import { RXDB_ANONYMOUS_SUBJECT, RxDB, RxDBError, RxDBIdentityMismatchError, RxDBSync, SyncType } from '@aiao/rxdb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assertRemoteBackend,
  assertRemoteBackendIs,
  bindRemoteBackend,
  rebindRemoteBackend
} from '../remote-backend.js';
import type { SyncManager } from '../SyncManager.js';

const SCOPE = 'https://project-a.supabase.co';
const USER_A = '00000000-0000-4000-8000-0000000000a1';
const USER_B = '00000000-0000-4000-8000-0000000000b2';

const syncRecord = (entity: string, remoteBackendId: string | null) =>
  Object.assign(Object.create(RxDBSync.prototype) as RxDBSync, {
    id: `public:${entity}:main`,
    namespace: 'public',
    entity,
    branchId: 'main',
    lastPushedChangeId: 7,
    lastPullRemoteChangeId: 42,
    remoteBackendId
  });

interface HarnessOptions {
  /** 本实例声明的身份；不传就是没声明 */
  subject?: string;
  /** 远端会话此刻报告的身份；`undefined` 表示适配器不实现 `callerIdentity` */
  reported?: string;
  records?: RxDBSync[];
}

const instances = new Set<RxDB>();
let index = 0;

const createHarness = (options: HarnessOptions) => {
  index += 1;
  const rxdb = new RxDB({
    dbName: `remote-identity-${index}`,
    entities: [],
    sync: { type: SyncType.None },
    ...(options.subject === undefined ? {} : { identity: { scope: SCOPE, subject: options.subject } })
  });
  instances.add(rxdb);

  const backendId = vi.fn(async () => 'backend-a');
  const callerIdentity = vi.fn(async () => ({ scope: SCOPE, subject: options.reported as string }));
  const remote = options.reported === undefined ? { backendId } : { backendId, callerIdentity };

  const records = options.records ?? [];
  const update = vi.fn(async (record: RxDBSync, patch: Partial<RxDBSync>) => Object.assign(record, patch));
  const repository = { find: vi.fn(async () => records), update };
  const transaction = vi.fn(async (fun: (executor: unknown) => Promise<unknown>) =>
    fun({ getRepository: () => repository })
  );
  const sm = {
    remoteBackendId: null,
    rxdb,
    getRemoteRepositories: vi.fn(async () => ({ adapter: remote })),
    getLocalRepositories: vi.fn(async () => ({ adapter: { getRepository: () => repository, transaction } }))
  } as unknown as SyncManager;

  return { sm, rxdb, backendId, callerIdentity, update, transaction };
};

afterEach(() => {
  instances.clear();
});

describe('远端会话是别的身份：一个远端请求都不发', () => {
  it('bindRemoteBackend：抛身份不匹配，先于 backendId()，写进 lastError，一行不写', async () => {
    const legacy = syncRecord('Todo', null);
    const harness = createHarness({ subject: USER_A, reported: USER_B, records: [legacy] });

    const error = await bindRemoteBackend(harness.sm).catch((rejection: unknown) => rejection);

    expect(error).toBeInstanceOf(RxDBIdentityMismatchError);
    expect(error).toMatchObject({ source: 'remote' });
    expect(harness.backendId).not.toHaveBeenCalled();
    expect(harness.update).not.toHaveBeenCalled();
    expect(legacy.remoteBackendId).toBeNull();
    expect(harness.rxdb.syncState.snapshot.lastError).toBe(error);
  });

  it('assertRemoteBackend（检查更新直接用它）：同样先核对身份', async () => {
    const harness = createHarness({ subject: USER_A, reported: USER_B });

    await expect(assertRemoteBackend(harness.sm)).rejects.toBeInstanceOf(RxDBIdentityMismatchError);
    expect(harness.backendId).not.toHaveBeenCalled();
  });

  it('assertRemoteBackendIs（分支物化在冻结之后再核对）：同样先核对身份', async () => {
    const harness = createHarness({ subject: USER_A, reported: USER_B });
    const remote = (await harness.sm.getRemoteRepositories()).adapter;

    await expect(assertRemoteBackendIs(harness.sm, remote as never, 'backend-a')).rejects.toBeInstanceOf(
      RxDBIdentityMismatchError
    );
    expect(harness.backendId).not.toHaveBeenCalled();
  });

  it('rebindRemoteBackend：同样先核对身份，不开事务、不改绑', async () => {
    const stale = syncRecord('Todo', 'backend-old');
    const harness = createHarness({ subject: USER_A, reported: USER_B, records: [stale] });

    await expect(rebindRemoteBackend(harness.sm)).rejects.toBeInstanceOf(RxDBIdentityMismatchError);

    expect(harness.backendId).not.toHaveBeenCalled();
    expect(harness.transaction).not.toHaveBeenCalled();
    expect(stale).toMatchObject({ remoteBackendId: 'backend-old', lastPullRemoteChangeId: 42 });
  });

  it('登录用户的库遇到未登录的会话：同样拒绝', async () => {
    const harness = createHarness({ subject: USER_A, reported: RXDB_ANONYMOUS_SUBJECT });

    await expect(bindRemoteBackend(harness.sm)).rejects.toBeInstanceOf(RxDBIdentityMismatchError);
    expect(harness.backendId).not.toHaveBeenCalled();
  });
});

describe('远端会话就是声明的身份：照常核对远端并绑定', () => {
  it('先问身份，再问远端身份，再把未绑定的记录绑上去', async () => {
    const legacy = syncRecord('Todo', null);
    const harness = createHarness({ subject: USER_A, reported: USER_A, records: [legacy] });

    await expect(bindRemoteBackend(harness.sm)).resolves.toBe('backend-a');

    expect(harness.callerIdentity).toHaveBeenCalledTimes(1);
    expect(harness.callerIdentity.mock.invocationCallOrder[0]).toBeLessThan(
      harness.backendId.mock.invocationCallOrder[0]
    );
    expect(legacy.remoteBackendId).toBe('backend-a');
    expect(harness.rxdb.syncState.snapshot.lastError).toBeNull();
  });

  it('每次入口都重新问，不缓存：第二次会话已经换了主人就拒绝', async () => {
    const harness = createHarness({ subject: USER_A, reported: USER_A });
    await bindRemoteBackend(harness.sm);
    harness.callerIdentity.mockResolvedValueOnce({ scope: SCOPE, subject: USER_B });

    await expect(bindRemoteBackend(harness.sm)).rejects.toBeInstanceOf(RxDBIdentityMismatchError);
    expect(harness.callerIdentity).toHaveBeenCalledTimes(2);
  });
});

describe('没有声明身份：与没有这个功能时一致', () => {
  it('不问 callerIdentity，按原样核对远端', async () => {
    const harness = createHarness({ reported: USER_B });

    await expect(bindRemoteBackend(harness.sm)).resolves.toBe('backend-a');
    expect(harness.callerIdentity).not.toHaveBeenCalled();
  });

  it('适配器不实现 callerIdentity 也不受影响', async () => {
    const harness = createHarness({});

    await expect(bindRemoteBackend(harness.sm)).resolves.toBe('backend-a');
  });
});

describe('声明了身份却无法核对', () => {
  it('远端适配器不实现 callerIdentity：拒绝，不当作通过，也不发任何远端请求', async () => {
    const harness = createHarness({ subject: USER_A });

    const error = await bindRemoteBackend(harness.sm).catch((rejection: unknown) => rejection);

    expect(error).toBeInstanceOf(RxDBError);
    expect(error).not.toBeInstanceOf(RxDBIdentityMismatchError);
    expect((error as Error).message).toContain('callerIdentity');
    expect(harness.backendId).not.toHaveBeenCalled();
  });
});
