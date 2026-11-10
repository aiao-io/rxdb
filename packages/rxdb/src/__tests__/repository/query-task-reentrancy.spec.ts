/**
 * 结果 / 错误分发期间的重入订阅（RV-01a1ba81695678a6a2205848be32d8f6、RV-01a1ba8169a87645a67426f896884c5b）。
 *
 * 同一查询的多个订阅者共用一个 `QueryTask`。分发结果或错误时，回调里同步发生的订阅 / 退订
 * 不能混进**这一轮**分发：
 * - 结果回调里新订阅的观察者由热启动拿到当前值，不能再被同一轮广播追加一次；
 * - 错误回调里重订阅（`retry()`）的观察者属于下一代，要落到一个会重新执行查询的任务上，
 *   而不是挂回正在分发失败、不会再跑的旧任务，再收一遍同一个错误。
 */
import { retry, type Subscription } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EntityBase } from '../../entity/entity-base.js';
import { Entity } from '../../entity/entity.decorator.js';
import { PropertyType, SyncType } from '../../entity/metadata-options.interface.js';
import type { IRepository } from '../../repository/repository.interface.js';
import { RxDB } from '../../RxDB.js';
import { createMockAdapter, type MockLocalAdapter } from '../fixtures/test-db-setup.js';

@Entity({ name: 'ReentrancyRow', properties: [{ name: 'title', type: PropertyType.string }] })
class ReentrancyRow extends EntityBase {
  title!: string;
}

const where = { combinator: 'and' as const, rules: [] };

let database: RxDB;
let adapter: MockLocalAdapter;
let repository: IRepository<typeof ReentrancyRow>;
const subscriptions: Subscription[] = [];

beforeEach(async () => {
  database = new RxDB({
    dbName: `query-task-reentrancy-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    entities: [ReentrancyRow],
    multiInstance: false,
    sync: { local: { adapter: 'mock' }, type: SyncType.None }
  });
  database.adapter('mock', db => {
    adapter = createMockAdapter(db);
    repository = adapter.stubEntityRepository(ReentrancyRow) as IRepository<typeof ReentrancyRow>;
    return adapter;
  });
  await database.connect('mock');
});

afterEach(async () => {
  for (const subscription of subscriptions.splice(0)) subscription.unsubscribe();
  await database.destroy();
});

/** 第一次 count() 返回手动结算的 Promise，之后返回 `next`。 */
const firstCountPending = (next: number) => {
  let settle!: { resolve: (value: number) => void; reject: (error: unknown) => void };
  const first = new Promise<number>((resolve, reject) => {
    settle = { resolve, reject };
  });
  const count = vi.fn<IRepository<typeof ReentrancyRow>['count']>();
  count.mockImplementationOnce(() => first).mockImplementation(async () => next);
  repository.count = count;
  return { count, settle };
};

describe('错误分发期间的 retry 重新执行查询', () => {
  it.each([
    ['retry 订阅者先登记', true],
    ['普通订阅者先登记', false]
  ])('%s：瞬时失败后 retry 拿到第二次查询的结果，普通订阅者照常收到错误', async (_label, retryFirst) => {
    const { count, settle } = firstCountPending(7);
    const query = database.entityManager.getRepository(ReentrancyRow).count({ where });
    const retried = { values: [] as number[], errors: [] as unknown[] };
    const plain = { values: [] as number[], errors: [] as unknown[] };
    const subscribeRetry = () =>
      query.pipe(retry(1)).subscribe({
        next: value => retried.values.push(value),
        error: error => retried.errors.push(error)
      });
    const subscribePlain = () =>
      query.subscribe({ next: value => plain.values.push(value), error: error => plain.errors.push(error) });
    subscriptions.push(...(retryFirst ? [subscribeRetry(), subscribePlain()] : [subscribePlain(), subscribeRetry()]));

    const transient = new Error('transient');
    settle.reject(transient);

    await vi.waitFor(() => expect(retried.values).toEqual([7]));
    expect(count).toHaveBeenCalledTimes(2);
    expect(retried.errors).toEqual([]);
    expect(plain.errors).toEqual([transient]);
    expect(plain.values).toEqual([]);

    // 旧任务的清理晚于新任务入表，按键删就会把接替它的新任务摘掉：后来者便不再共用它，
    // 而是另起第三次查询（新任务也从此收不到实体变更事件）
    const late: number[] = [];
    subscriptions.push(query.subscribe(value => late.push(value)));
    expect(late).toEqual([7]);
    expect(count).toHaveBeenCalledTimes(2);
  });
});

describe('结果分发期间新增的订阅者只收到一次', () => {
  it('结果回调里同步订阅同一查询：热启动拿到当前值，不再被同一轮广播追加', async () => {
    const { settle } = firstCountPending(99);
    const query = database.entityManager.getRepository(ReentrancyRow).count({ where });
    const first: number[] = [];
    const nested: number[] = [];
    subscriptions.push(
      query.subscribe(value => {
        first.push(value);
        if (first.length === 1) subscriptions.push(query.subscribe(inner => nested.push(inner)));
      })
    );

    settle.resolve(3);

    await vi.waitFor(() => expect(first).toEqual([3]));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(nested).toEqual([3]);
  });

  it('结果回调里退订另一个订阅者：它不再收到这一轮结果', async () => {
    const { settle } = firstCountPending(99);
    const query = database.entityManager.getRepository(ReentrancyRow).count({ where });
    const second: number[] = [];
    // 先登记的订阅者在回调里退订后登记的那个：插入序就是分发序
    const holder: { second?: Subscription } = {};
    subscriptions.push(query.subscribe(() => holder.second?.unsubscribe()));
    holder.second = query.subscribe(value => second.push(value));
    subscriptions.push(holder.second);

    settle.resolve(3);
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(second).toEqual([]);
  });

  it('普通多订阅：每个新结果每位观察者恰好一次', async () => {
    const { settle } = firstCountPending(99);
    const query = database.entityManager.getRepository(ReentrancyRow).count({ where });
    const a: number[] = [];
    const b: number[] = [];
    subscriptions.push(
      query.subscribe(value => a.push(value)),
      query.subscribe(value => b.push(value))
    );

    settle.resolve(5);

    await vi.waitFor(() => expect(a).toEqual([5]));
    expect(b).toEqual([5]);
  });
});
