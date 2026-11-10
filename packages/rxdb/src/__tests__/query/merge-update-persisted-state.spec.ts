/**
 * UPDATE 增量合并按**持久化状态**判定成员资格与顺序（RV-01a1bb09c0527c96b536110e13603d0b）。
 *
 * 实体上未保存的编辑不在库里，SQL 活查询也不按它算；刷新门控（`need_refresh_update.ts` 的
 * `persistedState`）早已按基线值判定。增量合并若按可见值重判 where、重新排序，同一个查询走 SQL
 * 与走 JS 会得到两份不同的成员集合。实体引用本身仍保留用户草稿。
 */
import type { Subscription } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SyncType } from '../../entity/metadata-options.interface.js';
import type { RuleGroup } from '../../repository/query.interface.js';
import { EntityLocalUpdatedEvent } from '../../rxdb-events.js';
import { getEntityStatus } from '../../rxdb-utils.js';
import { RxDB } from '../../RxDB.js';
import { createMockAdapter, type MockLocalAdapter } from '../fixtures/test-db-setup.js';
import { Post, TEST_ENTITIES } from '../fixtures/test-entities.js';

let database: RxDB;
let adapter: MockLocalAdapter;
const subscriptions: Subscription[] = [];
const tick = (): Promise<void> => new Promise<void>(resolve => setTimeout(resolve, 0));
const earlier = new Date('2026-11-09T00:00:00Z');
const later = new Date('2026-11-09T01:00:00Z');

beforeEach(async () => {
  vi.stubGlobal('requestIdleCallback', (callback: IdleRequestCallback) => {
    callback({ didTimeout: false, timeRemaining: () => 50 } as IdleDeadline);
    return 1;
  });
  database = new RxDB({
    dbName: `merge-update-persisted-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    entities: TEST_ENTITIES,
    multiInstance: false,
    sync: { local: { adapter: 'mock' }, type: SyncType.None }
  });
  database.adapter('mock', db => {
    adapter = createMockAdapter(db);
    return adapter;
  });
  await database.connect('mock');
});

afterEach(async () => {
  for (const subscription of subscriptions.splice(0)) subscription.unsubscribe();
  await database.destroy();
  vi.unstubAllGlobals();
});

/** 像从库里读出来一样建一个已持久化的 Post（进身份缓存、未修改）。 */
const hydrate = (id: string, fields: Partial<InstanceType<typeof Post>>) =>
  database.entityManager.createEntityRef(
    Post,
    {
      id,
      title: 'original',
      content: 'content',
      published: false,
      authorId: null,
      createdAt: earlier,
      updatedAt: earlier,
      createdBy: null,
      updatedBy: null,
      ...fields
    } as never,
    { modified: false, local: true }
  ) as InstanceType<typeof Post>;

/** 另一个来源对库里那一行的修改。 */
const externalUpdate = (id: string, patch: Record<string, unknown>, inversePatch: Record<string, unknown>) =>
  new EntityLocalUpdatedEvent([
    {
      type: 'UPDATE',
      namespace: 'public',
      entity: 'Post',
      id,
      patch: { ...patch, updatedAt: later },
      inversePatch: { ...inversePatch, updatedAt: earlier },
      recordAt: later
    }
  ]);

const ids = (rows: InstanceType<typeof Post>[]) => rows.map(row => row.id);
const where = (rules: RuleGroup<InstanceType<typeof Post>>['rules']): RuleGroup<InstanceType<typeof Post>> => ({
  combinator: 'and',
  rules
});

describe('UPDATE 增量合并按持久化状态判定', () => {
  it('findAll：筛选字段有未保存编辑时，无关字段的外部更新不把库里仍命中的行移出结果', async () => {
    const id = '00000000-0000-7000-8000-00000000c001';
    const post = hydrate(id, {});
    const stub = adapter.stubEntityRepository(Post, [post]);
    const seen: string[][] = [];
    subscriptions.push(
      database.entityManager
        .getRepository(Post)
        .findAll({ where: where([{ field: 'published', operator: '=', value: false }]) })
        .subscribe(rows => seen.push(ids(rows)))
    );
    await vi.waitFor(() => expect(seen).toEqual([[id]]));

    post.published = true;
    database.dispatchEvent(externalUpdate(id, { title: 'external' }, { title: 'original' }));
    await tick();

    expect(seen.at(-1)).toEqual([id]);
    expect(stub.find).toHaveBeenCalledTimes(1);
    // 草稿原样保留，外部更新落在没被编辑的字段上
    expect(post.published).toBe(true);
    expect(post.title).toBe('external');
    expect(getEntityStatus(post).modified).toBe(true);
  });

  it('findAll：外部更新让库里的行新命中，即使该字段被本地编辑成别的值，也按库里的值并入结果', async () => {
    const id = '00000000-0000-7000-8000-00000000c002';
    const post = hydrate(id, { title: 'before' });
    adapter.stubEntityRepository(Post, []);
    const seen: string[][] = [];
    subscriptions.push(
      database.entityManager
        .getRepository(Post)
        .findAll({ where: where([{ field: 'title', operator: '=', value: 'remote' }]) })
        .subscribe(rows => seen.push(ids(rows)))
    );
    await vi.waitFor(() => expect(seen).toEqual([[]]));

    post.title = 'draft';
    database.dispatchEvent(externalUpdate(id, { title: 'remote' }, { title: 'before' }));
    await tick();

    expect(seen.at(-1)).toEqual([id]);
    expect(post.title).toBe('draft');
  });

  it('findAll：排序字段有未保存编辑时，增量合并按库里的值排序', async () => {
    const first = hydrate('00000000-0000-7000-8000-00000000c003', { title: 'a' });
    const second = hydrate('00000000-0000-7000-8000-00000000c004', { title: 'b' });
    adapter.stubEntityRepository(Post, [first, second]);
    const seen: string[][] = [];
    subscriptions.push(
      database.entityManager
        .getRepository(Post)
        .findAll({ where: where([]), orderBy: [{ field: 'title', sort: 'asc' }] })
        .subscribe(rows => seen.push(ids(rows)))
    );
    await vi.waitFor(() => expect(seen).toEqual([[first.id, second.id]]));

    first.title = 'z';
    database.dispatchEvent(externalUpdate(second.id, { content: 'external' }, { content: 'content' }));
    await tick();

    expect(seen.at(-1)).toEqual([first.id, second.id]);
  });

  it('findOne：筛选字段有未保存编辑时，无关字段的外部更新不判成不再命中、不多回一次 SQL', async () => {
    const id = '00000000-0000-7000-8000-00000000c005';
    const post = hydrate(id, {});
    const stub = adapter.stubEntityRepository(Post, [post]);
    const seen: (string | undefined)[] = [];
    subscriptions.push(
      database.entityManager
        .getRepository(Post)
        .findOne({ where: where([{ field: 'published', operator: '=', value: false }]) })
        .subscribe(row => seen.push(row?.id))
    );
    await vi.waitFor(() => expect(seen).toEqual([id]));

    post.published = true;
    database.dispatchEvent(externalUpdate(id, { title: 'external' }, { title: 'original' }));
    await tick();

    expect(stub.find).toHaveBeenCalledTimes(1);
    expect(seen.at(-1)).toBe(id);
  });
});
