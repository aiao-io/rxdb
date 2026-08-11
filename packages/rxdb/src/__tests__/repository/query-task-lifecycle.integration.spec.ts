import { of, type Subscription } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { getFingerprintByEntities, getFingerprintPrimitive } from '../../repository/fingerprint.utils.js';
import type { QueryOptions } from '../../repository/QueryManager.interface.js';
import { type MergeQueryTaskUpdateFn, type QueryManager } from '../../repository/QueryManager.js';
import { Repository } from '../../repository/Repository.js';
import { EntityLocalUpdatedEvent, type RxDBEntityLocalUpdatedEventData } from '../../rxdb-events.js';
import { createTestDB } from '../fixtures/test-db-setup.js';
import { Post, User } from '../fixtures/test-entities.js';

class LifecycleRepository extends Repository<typeof Post> {
  get taskManager(): QueryManager<typeof Post> {
    return this.queryManager;
  }
}

type PostResult = InstanceType<typeof Post>[];

const relationFindOptions = (authorName: string): QueryOptions<typeof Post> => ({
  type: 'find',
  options: {
    where: {
      combinator: 'and',
      rules: [
        {
          field: 'author',
          operator: 'exists',
          where: {
            combinator: 'and',
            rules: [{ field: 'name', operator: '=', value: authorName }]
          }
        }
      ]
    }
  }
});

const sentinelFindOptions: QueryOptions<typeof Post> = {
  type: 'find',
  options: {
    where: {
      combinator: 'and',
      rules: [{ field: 'title', operator: '=', value: 'sentinel' }]
    }
  }
};

const createFindTask = (manager: QueryManager<typeof Post>, options: QueryOptions<typeof Post>) =>
  manager.createTask<PostResult>({
    options,
    runner: () => of<PostResult>([]),
    getFingerprint: () => []
  });

/**
 * 计数型查询：每次真正执行 SQL 都会 +1，结果就是执行次数。
 * 用它可以直接看出「重新订阅到底有没有重新查」。
 */
const createCountingTask = (manager: QueryManager<typeof Post>) => {
  let runs = 0;
  const runner = vi.fn(() => of(++runs));
  const task = manager.createTask<number>({
    options: sentinelFindOptions,
    runner,
    getFingerprint: getFingerprintPrimitive
  });
  return { task, runner };
};

describe('QueryTask 复活', () => {
  it('全部退订后重新订阅会重新查询，而不是重放陈旧结果', async () => {
    const { rxdb, cleanup } = await createTestDB({ entities: [User, Post] });
    const repository = new LifecycleRepository(rxdb, Post);

    try {
      const { task, runner } = createCountingTask(repository.taskManager);
      const first: number[] = [];
      const subscription = task.result$.subscribe(value => first.push(value));

      expect(first).toEqual([1]);

      // 最后一个订阅者退订 → 任务被 clean：管道被 takeUntil 终结、#is_first_run 永久为 true
      subscription.unsubscribe();

      // 同一个 result$ 再订阅（Angular async 管道随 @if 反复挂载、switchMap 重入都会这样）
      const second: number[] = [];
      task.result$.subscribe(value => second.push(value));

      // 陈旧复活的表现：立刻收到上一轮的 1，而后永远不再更新
      expect(runner).toHaveBeenCalledTimes(2);
      expect(second).toEqual([2]);
    } finally {
      repository.destroy();
      await rxdb.disconnectAll();
      await cleanup();
    }
  });

  it('复活后的任务重新接受增量事件', async () => {
    const { rxdb, cleanup } = await createTestDB({ entities: [User, Post] });
    const repository = new LifecycleRepository(rxdb, Post);
    const manager = repository.taskManager;
    const updatePipeline = vi.fn<MergeQueryTaskUpdateFn<typeof Post>>();
    manager.registerMergeUpdateFn('find', updatePipeline);

    try {
      const task = createFindTask(manager, sentinelFindOptions);
      task.result$.subscribe().unsubscribe();

      const subscription = task.result$.subscribe();
      rxdb.dispatchEvent(
        new EntityLocalUpdatedEvent([
          {
            type: 'UPDATE',
            namespace: 'public',
            entity: 'Post',
            id: '00000000-0000-0000-0000-000000000002',
            recordAt: new Date(),
            patch: { title: 'updated' },
            inversePatch: { title: 'before' }
          } satisfies RxDBEntityLocalUpdatedEventData<typeof Post>
        ])
      );

      // clean 会把任务从 #query_task_map 摘掉；复活必须重新入表，否则增量合并再也看不到它
      await vi.waitFor(() => expect(updatePipeline).toHaveBeenCalledTimes(1));
      subscription.unsubscribe();
    } finally {
      repository.destroy();
      await rxdb.disconnectAll();
      await cleanup();
    }
  });

  it('destroy 会清理仍在订阅中的任务并完成观察者', async () => {
    const { rxdb, cleanup } = await createTestDB({ entities: [User, Post] });
    const repository = new LifecycleRepository(rxdb, Post);
    const manager = repository.taskManager;

    try {
      const task = createFindTask(manager, relationFindOptions('alive'));
      const completed = vi.fn();
      const subscription = task.result$.subscribe({ complete: completed });

      manager.destroy();

      // destroy 只 clear() 而不 clean()：destroy$ 永不触发，管道、观察者与依赖计数全部泄漏
      expect(completed).toHaveBeenCalledTimes(1);
      expect(subscription.closed).toBe(true);
      expect(task.observers.size).toBe(0);
    } finally {
      await rxdb.disconnectAll();
      await cleanup();
    }
  });
});

describe('QueryTask dependency lifecycle integration', () => {
  it('keeps a shared dependency active until the final task is cleaned', async () => {
    const { rxdb, cleanup } = await createTestDB({ entities: [User, Post] });
    const repository = new LifecycleRepository(rxdb, Post);
    const manager = repository.taskManager;
    const updatePipeline = vi.fn<MergeQueryTaskUpdateFn<typeof Post>>();

    manager.registerMergeUpdateFn('find', updatePipeline);

    const firstDependentTask = createFindTask(manager, relationFindOptions('first'));
    const lastDependentTask = createFindTask(manager, relationFindOptions('last'));
    const sentinelTask = createFindTask(manager, sentinelFindOptions);
    const subscriptions: Subscription[] = [
      firstDependentTask.result$.subscribe(),
      lastDependentTask.result$.subscribe(),
      sentinelTask.result$.subscribe()
    ];

    const userUpdate = {
      type: 'UPDATE',
      namespace: 'public',
      entity: 'User',
      id: '00000000-0000-0000-0000-000000000001',
      recordAt: new Date(),
      patch: { name: 'updated' },
      inversePatch: { name: 'before' }
    } satisfies RxDBEntityLocalUpdatedEventData<typeof User>;

    const postUpdate = {
      type: 'UPDATE',
      namespace: 'public',
      entity: 'Post',
      id: '00000000-0000-0000-0000-000000000002',
      recordAt: new Date(),
      patch: { title: 'updated' },
      inversePatch: { title: 'before' }
    } satisfies RxDBEntityLocalUpdatedEventData<typeof Post>;

    try {
      subscriptions[0].unsubscribe();
      firstDependentTask.clean();
      firstDependentTask.clean();

      rxdb.dispatchEvent(new EntityLocalUpdatedEvent([userUpdate]));

      await vi.waitFor(() => {
        expect(updatePipeline.mock.calls.map(([task]) => task)).toEqual([lastDependentTask, sentinelTask]);
      });
      expect(updatePipeline.mock.calls.map(([, entities]) => entities.map(entity => entity.entity))).toEqual([
        ['User'],
        ['User']
      ]);

      updatePipeline.mockClear();
      subscriptions[1].unsubscribe();

      expect(subscriptions[2].closed).toBe(false);

      rxdb.dispatchEvent(new EntityLocalUpdatedEvent([userUpdate]));
      rxdb.dispatchEvent(new EntityLocalUpdatedEvent([postUpdate]));

      await vi.waitFor(() => {
        expect(
          updatePipeline.mock.calls.some(([, entities]) => entities.some(entity => entity.entity === 'Post'))
        ).toBe(true);
      });

      expect(updatePipeline.mock.calls.map(([task]) => task)).toEqual([sentinelTask]);
      expect(updatePipeline.mock.calls.map(([, entities]) => entities.map(entity => entity.entity))).toEqual([
        ['Post']
      ]);
    } finally {
      subscriptions.forEach(subscription => subscription.unsubscribe());
      repository.destroy();
      await rxdb.disconnectAll();
      await cleanup();
    }
  });
});

/**
 * RXD-052：结果指纹原为 `${id}@${updatedAt}`，`QueryTask.#next` 用它判断「结果是否变化」。
 * 于是任何**不改 updatedAt 的业务字段变化**都被判成「没变」而不发射 —— 增量合并明明已经把
 * 新值写进缓存实体了，订阅者却永远停在旧值上。
 *
 * `notifyExternalUpdate` 是这条路径上有名有姓的公开入口（rawQuery 绕过 ORM 改库后的标准通知），
 * 它不要求 patch 带 `updatedAt`；`QueryManager` 自己还专门把「只有 updatedAt」的 patch 过滤掉
 * （「避免无意义的缓存刷新」）—— 管道丢掉的正是指纹唯一采信的信号，留下的正是指纹看不见的信号。
 */
describe('查询失效口径（RXD-052）', () => {
  const publishedFindAllOptions: QueryOptions<typeof Post> = {
    type: 'findAll',
    options: {
      where: {
        combinator: 'and',
        rules: [{ field: 'published', operator: '=', value: true }]
      }
    }
  };

  it('外部业务字段 patch 不带 updatedAt 时，活查询必须收到新值', async () => {
    const { rxdb, cleanup } = await createTestDB({ entities: [User, Post] });
    const repository = new LifecycleRepository(rxdb, Post);
    const postId = '00000000-0000-0000-0000-0000000000a1';
    const updatedAt = new Date('2024-01-01T00:00:00Z');

    try {
      const post = rxdb.entityManager.createEntityRef(Post, {
        id: postId,
        title: 'old',
        content: '',
        published: true,
        createdAt: updatedAt,
        updatedAt
      })!;

      const task = repository.taskManager.createTask<PostResult>({
        options: publishedFindAllOptions,
        runner: () => of([post]),
        getFingerprint: getFingerprintByEntities
      });

      const seen: string[][] = [];
      const subscription = task.result$.subscribe(result => seen.push(result.map(item => item.title)));
      expect(seen).toEqual([['old']]);

      rxdb.entityManager.notifyExternalUpdate(Post, postId, { title: 'new' });

      await vi.waitFor(() => expect(seen).toEqual([['old'], ['new']]));
      // 缓存实体确实被改到了新值 —— 缺的只是「发射」这一步，不是「合并」这一步
      expect(post.title).toBe('new');
      expect(post.updatedAt?.getTime()).toBe(updatedAt.getTime());
      subscription.unsubscribe();
    } finally {
      repository.destroy();
      await rxdb.disconnectAll();
      await cleanup();
    }
  });
});
