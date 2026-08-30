/**
 * RxDB `database` provider（US-904 阶段 D AC#46）。
 *
 * @remarks
 * 这个 provider 是三端共用的：`runtime` 只进 descriptor 的显示字段，其余一律同构。
 * 因此 descriptor 用例把 `electron` 与 `browser` 两份并排比对——除 `runtime` 外必须逐字段相等，
 * 任何「按 runtime 分叉」的实现都会在这里变红。
 */

import type { EntityType } from '@aiao/rxdb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DevToolsEntityMetadata, GetEntityMetadataFn } from '../../connector-types.js';
import { RXDB_EVENT_TYPES } from '../../connector-events.js';
import type { DevToolsProviderResult } from '../../provider/types.js';
import { createDevToolsRxdbDatabaseProvider } from '../../rxdb/database-provider.js';
import { createMockRxDB, listenerCount, MOCK_DB_NAME, MOCK_VERSION, type MockRxDB } from '../fixtures/mock-rxdb.js';

class Article {}
class Comment {}
class BranchEntity {}

const ARTICLE = Article as unknown as EntityType;
const COMMENT = Comment as unknown as EntityType;
const BRANCH = BranchEntity as unknown as EntityType;

const METADATA = new Map<EntityType, DevToolsEntityMetadata>([
  [ARTICLE, { name: 'Article', namespace: 'public', encryptedPropertyMap: new Map([['body', null]]) }],
  [COMMENT, { name: 'Comment', namespace: 'public' }],
  [BRANCH, { name: 'RxDBBranch', namespace: 'rxdb' }]
]);

const metadataReader =
  (table: ReadonlyMap<EntityType, DevToolsEntityMetadata>): GetEntityMetadataFn =>
  entity =>
    table.get(entity);

/** 造一个同步吐出 `documents` 的 repository；`calls` 收下每次查询的 limit。 */
function repositoryOf(documents: readonly unknown[], calls: (number | undefined)[] = []) {
  return {
    find(options: { limit?: number }) {
      calls.push(options.limit);
      return {
        subscribe(callback: (data: unknown[]) => void) {
          callback([...documents]);
          return { unsubscribe: () => undefined };
        }
      };
    }
  };
}

/** 按实体分派的 entityManager：没登记的实体拿到空 repository。 */
function entityManagerOf(table: ReadonlyMap<EntityType, readonly unknown[]>, calls: (number | undefined)[] = []) {
  return { getRepository: (entity: EntityType) => repositoryOf(table.get(entity) ?? [], calls) };
}

function expectOk(result: DevToolsProviderResult): Record<string, unknown> {
  expect(result.outcome).toBe('ok');
  if (result.outcome !== 'ok') throw new Error('unreachable');
  return result.result as Record<string, unknown>;
}

function expectFailed(result: DevToolsProviderResult): string {
  expect(result.outcome).toBe('failed');
  if (result.outcome !== 'failed') throw new Error('unreachable');
  return result.error.code;
}

describe('RxDB database provider（AC#46）', () => {
  let rxdb: MockRxDB;
  let emitted: { eventType: string; data: unknown }[];

  /** 显式指定实例——`undefined` 表示「还没 init」，不能写成默认参数（传 undefined 会落回默认值）。 */
  const createWith = (instance: MockRxDB | undefined, runtime: 'browser' | 'electron' = 'electron') =>
    createDevToolsRxdbDatabaseProvider({
      getRxDB: () => instance,
      getEntityMetadata: metadataReader(METADATA),
      runtime,
      emitEvent: (eventType, data) => emitted.push({ eventType, data })
    });

  const create = (runtime: 'browser' | 'electron' = 'electron') => createWith(rxdb, runtime);

  beforeEach(() => {
    emitted = [];
    // 夹具默认的 repository 从不回调，查询会一直挂到超时；这里换成「同步回空集」的版本。
    rxdb = createMockRxDB({
      config: { dbName: MOCK_DB_NAME, entities: [ARTICLE, COMMENT, BRANCH] },
      entityManager: entityManagerOf(new Map())
    });
  });

  it('descriptor 宣告全部七个语义操作，runtime 只影响显示', () => {
    const electron = create('electron').descriptor;
    const browser = create('browser').descriptor;

    expect(electron.domain).toBe('database');
    expect(electron.kind).toBe('rxdb');
    expect(electron.operations).toEqual([
      'inspect',
      'query',
      'events',
      'get-branches',
      'switch-branch',
      'create-branch',
      'delete-branch'
    ]);
    // 数据库领域没有字节传输：声明非零上限等于允许对端在这个领域上发起 transfer。
    expect(electron.limits.maxTransferBytes).toBe(0);
    expect(electron.runtime).toBe('electron');
    expect(browser.runtime).toBe('browser');
    expect({ ...electron, runtime: 'browser' }).toEqual(browser);
  });

  it('inspect 回库名、版本与实体清单（含加密字段）', async () => {
    const result = expectOk(await create().invoke('inspect', {}));

    expect(result['dbName']).toBe(MOCK_DB_NAME);
    expect(result['version']).toBe(MOCK_VERSION);
    expect(result['entities']).toEqual([
      { name: 'Article', namespace: 'public', encryptedFields: ['body'] },
      { name: 'Comment', namespace: 'public', encryptedFields: [] },
      { name: 'RxDBBranch', namespace: 'rxdb', encryptedFields: [] }
    ]);
  });

  it('RxDB 未就绪时回 provider_unavailable，而不是空结果', async () => {
    expect(expectFailed(await createWith(undefined).invoke('inspect', {}))).toBe('provider_unavailable');
    expect(expectFailed(await createWith(undefined).invoke('query', { entityName: 'Article' }))).toBe('provider_unavailable');
    expect(expectFailed(await createWith(undefined).invoke('get-branches', {}))).toBe('provider_unavailable');
    expect(expectFailed(await createWith(undefined).invoke('switch-branch', { id: 'main' }))).toBe('provider_unavailable');
  });

  it('query 按 limit 取数并遮罩加密字段', async () => {
    const calls: (number | undefined)[] = [];
    rxdb = createMockRxDB({
      config: { dbName: MOCK_DB_NAME, entities: [ARTICLE] },
      entityManager: entityManagerOf(new Map([[ARTICLE, [{ id: '1', body: 'secret', title: 'ok' }]]]), calls)
    });

    const result = expectOk(await create().invoke('query', { entityName: 'Article', limit: 5 }));

    expect(calls).toEqual([5]);
    expect(result['entityName']).toBe('Article');
    expect(result['encryptedFields']).toEqual(['body']);
    expect(result['documents']).toEqual([{ id: '1', body: '[encrypted]', title: 'ok' }]);
  });

  it('未知实体回 resource_not_found，重名且未指定 namespace 回 resource_conflict', async () => {
    expect(expectFailed(await create().invoke('query', { entityName: 'Nope' }))).toBe('resource_not_found');
    expect(expectFailed(await create().invoke('query', {}))).toBe('invalid_path');

    const ambiguous = new Map(METADATA);
    ambiguous.set(COMMENT, { name: 'Article', namespace: 'private' });
    const provider = createDevToolsRxdbDatabaseProvider({
      getRxDB: () => rxdb,
      getEntityMetadata: metadataReader(ambiguous),
      runtime: 'electron',
      emitEvent: () => undefined
    });

    expect(expectFailed(await provider.invoke('query', { entityName: 'Article' }))).toBe('resource_conflict');
    // 指定 namespace 即可消歧，不该被上一条的歧义状态污染。
    expect(expectOk(await provider.invoke('query', { entityName: 'Article', namespace: 'private' }))['namespace']).toBe(
      'private'
    );
  });

  it('查询订阅报错时映射成 provider 错误，且不泄漏原文', async () => {
    rxdb = createMockRxDB({
      config: { dbName: MOCK_DB_NAME, entities: [ARTICLE] },
      entityManager: {
        getRepository: () => ({
          find: () => {
            throw new Error('SELECT * FROM article WHERE token = "secret"');
          }
        })
      }
    });

    const result = await create().invoke('query', { entityName: 'Article' });

    expect(result.outcome).toBe('failed');
    if (result.outcome !== 'failed') throw new Error('unreachable');
    expect(result.error.code).toBe('operation_failed');
    expect(result.error.message).toBeUndefined();
  });

  it('events 订阅全部 RXDB_EVENT_TYPES 并逐类派发', async () => {
    const provider = create();
    const result = expectOk(await provider.invoke('events', {}));

    expect(result['eventTypes']).toBe(RXDB_EVENT_TYPES.length);
    expect(listenerCount(rxdb)).toBe(RXDB_EVENT_TYPES.length);

    for (const type of RXDB_EVENT_TYPES) rxdb.emit(type, { type });
    expect(emitted.map(entry => entry.eventType)).toEqual([...RXDB_EVENT_TYPES]);

    provider.dispose();
    expect(listenerCount(rxdb)).toBe(0);
  });

  it('派发出去的事件已按实体加密字段遮罩', async () => {
    const provider = create();
    await provider.invoke('events', {});

    rxdb.emit('ENTITY_LOCAL_CREATE', {
      type: 'ENTITY_LOCAL_CREATE',
      entities: [{ entity: 'Article', namespace: 'public', data: { id: '1', body: 'secret', title: 'ok' } }]
    });

    expect(emitted).toHaveLength(1);
    expect(emitted[0].data).toMatchObject({
      entities: [{ entity: 'Article', data: { id: '1', body: '[encrypted]', title: 'ok' } }]
    });
    provider.dispose();
  });

  it('events 重复调用不重复订阅', async () => {
    const provider = create();
    await provider.invoke('events', {});
    await provider.invoke('events', {});

    expect(listenerCount(rxdb)).toBe(RXDB_EVENT_TYPES.length);
    provider.dispose();
  });

  it('get-branches 回 id 与激活态；没有分支实体时回 resource_not_found', async () => {
    rxdb = createMockRxDB({
      config: { dbName: MOCK_DB_NAME, entities: [ARTICLE, BRANCH] },
      entityManager: entityManagerOf(
        new Map([
          [
            BRANCH,
            [
              { id: 'main', activated: true },
              { id: 'feature', activated: false }
            ]
          ]
        ])
      )
    });

    expect(expectOk(await create().invoke('get-branches', {}))['branches']).toEqual([
      { id: 'main', activated: true },
      { id: 'feature', activated: false }
    ]);

    // 没装版本插件时必须是可判别的失败：回空数组等于把「不支持分支」谎报成「一个分支都没有」。
    rxdb = createMockRxDB({ config: { dbName: MOCK_DB_NAME, entities: [ARTICLE] } });
    expect(expectFailed(await create().invoke('get-branches', {}))).toBe('resource_not_found');
  });

  it('分支三个写操作走 versionManager，缺 id 回 invalid_path', async () => {
    const switchBranch = vi.fn<(value: string) => Promise<void>>().mockResolvedValue(undefined);
    const createBranch = vi.fn<(value: string) => Promise<unknown>>().mockResolvedValue({});
    const removeBranch = vi.fn<(value: string) => Promise<void>>().mockResolvedValue(undefined);
    rxdb = createMockRxDB({ versionManager: { switchBranch, createBranch, removeBranch } });
    const provider = create();

    expect(expectOk(await provider.invoke('switch-branch', { id: 'feature' }))).toEqual({ id: 'feature' });
    expect(expectOk(await provider.invoke('create-branch', { id: 'feature' }))).toEqual({ id: 'feature' });
    expect(expectOk(await provider.invoke('delete-branch', { id: 'feature' }))).toEqual({ id: 'feature' });
    expect(switchBranch).toHaveBeenCalledWith('feature');
    expect(createBranch).toHaveBeenCalledWith('feature');
    expect(removeBranch).toHaveBeenCalledWith('feature');

    expect(expectFailed(await provider.invoke('switch-branch', {}))).toBe('invalid_path');
    expect(expectFailed(await provider.invoke('create-branch', { id: '' }))).toBe('invalid_path');
    expect(expectFailed(await provider.invoke('delete-branch', { id: 42 }))).toBe('invalid_path');
    expect(switchBranch).toHaveBeenCalledTimes(1);
  });

  it('versionManager 抛错时映射成脱敏的 provider 错误', async () => {
    rxdb = createMockRxDB({
      versionManager: {
        switchBranch: () => Promise.reject(new Error('boom at /Users/secret/db.sqlite')),
        createBranch: () => Promise.resolve({}),
        removeBranch: () => Promise.resolve()
      }
    });

    const result = await create().invoke('switch-branch', { id: 'feature' });

    expect(result.outcome).toBe('failed');
    if (result.outcome !== 'failed') throw new Error('unreachable');
    expect(result.error.code).toBe('operation_failed');
    // 平台异常原文里带绝对路径，映射层结构上不转发 message。
    expect(result.error.message).toBeUndefined();
  });

  it('未声明的操作回 provider_unsupported', async () => {
    expect(expectFailed(await create().invoke('export', {}))).toBe('provider_unsupported');
    expect(expectFailed(await create().invoke('list', {}))).toBe('provider_unsupported');
  });
});
