/**
 * @fileoverview SUPA-007：带 `where` 的 `notExists` 不得谎报
 *
 * `notExists` 无子条件时走 `relation IS NULL`，语义正确。
 * 一旦带上 `where`，PostgREST 端**没有**能表达 anti-join 的构造 ——
 * 嵌套过滤只裁 embed 出来的子行，不裁父行。
 * 因此这个组合只有两种诚实的归宿：服务端 RPC，或明确拒绝。
 * 这里选后者（见 rule_group_builder.ts 的 throw），本文件同时锁住：
 *
 * 1. 拒绝是显式的、发生在发请求之前；
 * 2. 不带 `where` 的 `notExists` 三态仍然正确（拒绝不能误伤既有能力）。
 */

import { RxDB, SyncType } from '@aiao/rxdb';
import { ENTITIES, Order, User } from '@aiao/rxdb-test/shop';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterSupabase } from '../index.js';
import type { SupabaseRepository } from '../SupabaseRepository.js';

const SUPABASE_URL = import.meta.env['VITE_SUPABASE_URL'] || '';
const SUPABASE_KEY = import.meta.env['VITE_SUPABASE_KEY'] || '';

/** 判定 `notExists` 的金额阈值：`big` 的订单在其上，`small` 的在其下 */
const THRESHOLD = 1000;

describe('SUPA-007 — 带 where 的 notExists', () => {
  let adapter: RxDBAdapterSupabase;
  let userRepo: SupabaseRepository<typeof User>;

  const tag = `nx-${Date.now()}`;
  const ids: Record<string, string> = {};

  /**
   * 三态夹具（`where` 为 `amount >= THRESHOLD`）：
   *
   * | 用户    | 订单               | `notExists(orders, amount >= 1000)` 的正解 |
   * | ------- | ------------------ | ----------------------------------------- |
   * | `big`   | 一张 5000          | 不返回（有匹配子行）                      |
   * | `small` | 一张 10            | **返回**（有子行但都不匹配）              |
   * | `none`  | 无                 | **返回**（完全无子行）                    |
   *
   * `small` 是判别位：任何把子条件当正向嵌套过滤的实现都会把它和 `big` 弄反。
   */
  beforeAll(async () => {
    const rxdb = new RxDB({
      dbName: `not-exists-where-${Date.now()}`,
      context: { userId: 'test-user' },
      entities: ENTITIES,
      sync: { remote: { adapter: 'supabase' }, type: SyncType.None }
    });

    rxdb.adapter(
      'supabase',
      async db => new RxDBAdapterSupabase(db, { supabaseUrl: SUPABASE_URL, supabaseKey: SUPABASE_KEY })
    );
    rxdb.init();

    adapter = (await rxdb.getAdapter('supabase')) as RxDBAdapterSupabase;
    await adapter.connect();
    userRepo = adapter.getRepository(User) as SupabaseRepository<typeof User>;
    const orderRepo = adapter.getRepository(Order) as SupabaseRepository<typeof Order>;

    const addUser = async (key: string, amount?: number): Promise<void> => {
      const user = new User();
      user.name = `${tag}-${key}`;
      user.age = 30;
      await userRepo.create(user);
      ids[key] = user.id as string;

      if (amount === undefined) {
        return;
      }

      const order = new Order();
      order.number = `${tag}-${key}-order`;
      order.amount = amount;
      order.ownerId = user.id;
      await orderRepo.create(order);
    };

    await addUser('big', 5000);
    await addUser('small', 10);
    await addUser('none');
  }, 60_000);

  afterAll(async () => {
    await adapter.client.schema('shop').from('order').delete().like('number', `${tag}-%`);
    await adapter.client.schema('shop').from('user').delete().like('name', `${tag}-%`);
    await adapter.disconnect();
  }, 60_000);

  it('带 where 的 notExists 被显式拒绝，而不是给出错误结果', async () => {
    await expect(
      userRepo.find({
        where: {
          combinator: 'and',
          rules: [
            {
              field: 'orders',
              operator: 'notExists',
              where: { combinator: 'and', rules: [{ field: 'amount', operator: '>=', value: THRESHOLD }] }
            },
            { field: 'name', operator: 'startsWith', value: tag }
          ]
        }
      })
    ).rejects.toThrow(/notExists .*where/i);
  });

  it('不带 where 的 notExists 三态仍然正确', async () => {
    const result = await userRepo.find({
      where: {
        combinator: 'and',
        rules: [
          { field: 'orders', operator: 'notExists' },
          { field: 'name', operator: 'startsWith', value: tag }
        ]
      }
    });

    // 只有 none 完全没有订单；big / small 都有，与金额无关
    expect(result.map(user => user.id)).toEqual([ids['none']]);
  });

  it('不带 where 的 exists 三态仍然正确', async () => {
    const result = await userRepo.find({
      where: {
        combinator: 'and',
        rules: [
          { field: 'orders', operator: 'exists' },
          { field: 'name', operator: 'startsWith', value: tag }
        ]
      }
    });

    expect(result.map(user => user.id).sort()).toEqual([ids['big'], ids['small']].sort());
  });

  it('带 where 的 exists 不受影响：它本来就能用 !inner 表达', async () => {
    const result = await userRepo.find({
      where: {
        combinator: 'and',
        rules: [
          {
            field: 'orders',
            operator: 'exists',
            where: { combinator: 'and', rules: [{ field: 'amount', operator: '>=', value: THRESHOLD }] }
          },
          { field: 'name', operator: 'startsWith', value: tag }
        ]
      }
    });

    expect(result.map(user => user.id)).toEqual([ids['big']]);
  });
});
