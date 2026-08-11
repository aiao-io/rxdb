import { describe, expect, it } from 'vitest';
import { ENTITY_IDENTITY_CACHE_SWEEP_FLOOR, EntityIdentityCache } from '../../entity/entity-identity-cache.js';
import { collectGarbageUntil } from '../fixtures/gc.js';

/**
 * 往缓存里塞一批**没人引用**的值：循环体结束后 `{ index }` 只被缓存里的 WeakRef 指着。
 */
const fillUnreferenced = (cache: EntityIdentityCache<object>, from: number, count: number) => {
  for (let index = from; index < from + count; index++) {
    cache.set(`k${index}`, { index });
  }
};

/**
 * 存一个值并只把 WeakRef 交出来——调用方拿不到强引用，无法意外延长它的生命。
 */
const setUnreferenced = (cache: EntityIdentityCache<object>, id: string): WeakRef<object> => {
  const value = { id };
  cache.set(id, value);
  return new WeakRef(value);
};

describe('EntityIdentityCache（RXD-011）', () => {
  it('set / get / has 维持同一个实例', () => {
    const cache = new EntityIdentityCache<object>();
    const value = { name: 'a' };
    cache.set('a', value);

    expect(cache.get('a')).toBe(value);
    expect(cache.has('a')).toBe(true);
    expect(cache.get('missing')).toBeUndefined();
    expect(cache.has('missing')).toBe(false);
  });

  it('delete 之后读不到', () => {
    const cache = new EntityIdentityCache<object>();
    const value = {};
    cache.set('a', value);
    cache.delete('a');

    expect(cache.get('a')).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it('clear 清空全部槽位', () => {
    const cache = new EntityIdentityCache<object>();
    const first = {};
    const second = {};
    cache.set('a', first);
    cache.set('b', second);
    cache.clear();

    expect(cache.size).toBe(0);
    expect(cache.get('a')).toBeUndefined();
  });

  it('同一 id 重复 set 覆盖旧值', () => {
    const cache = new EntityIdentityCache<object>();
    const first = { seq: 1 };
    const second = { seq: 2 };
    cache.set('a', first);
    cache.set('a', second);

    expect(cache.get('a')).toBe(second);
    expect(cache.size).toBe(1);
  });

  it('缓存本身不阻止回收：无人引用的值会被 GC 收走', async () => {
    const cache = new EntityIdentityCache<object>();
    const ref = setUnreferenced(cache, 'garbage');

    expect(await collectGarbageUntil(() => ref.deref() === undefined)).toBe(true);
    expect(cache.get('garbage')).toBeUndefined();
  });

  it('还有人引用时不回收——这正是删除态实体要留给订阅者的东西', async () => {
    const cache = new EntityIdentityCache<object>();
    const kept = { removed: true };
    cache.set('kept', kept);

    // 反过来断言：完整跑一次 GC 仍然回收不掉，因为 `kept` 是强引用。
    // 反向断言只给 1 次，理由见 collectGarbageUntil 的 `attempts` 说明。
    expect(await collectGarbageUntil(() => cache.get('kept') === undefined, 1)).toBe(false);
    expect(cache.get('kept')).toBe(kept);
  });

  it('get 命中已回收的槽位时顺手删掉死槽', async () => {
    const cache = new EntityIdentityCache<object>();
    const ref = setUnreferenced(cache, 'dead');

    expect(await collectGarbageUntil(() => ref.deref() === undefined)).toBe(true);
    // WeakRef 死了，Map 的 key 不会自己消失——槽位还占着
    expect(cache.size).toBe(1);

    expect(cache.get('dead')).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it('槽位堆到扫描阈值时清掉死槽', async () => {
    const cache = new EntityIdentityCache<object>();
    const ref = setUnreferenced(cache, 'probe');
    // 凑满 FLOOR 个槽位：第 FLOOR 次 set 会扫一遍，此刻全部存活，只把阈值推到 2×FLOOR
    fillUnreferenced(cache, 0, ENTITY_IDENTITY_CACHE_SWEEP_FLOOR - 1);
    expect(cache.size).toBe(ENTITY_IDENTITY_CACHE_SWEEP_FLOOR);

    expect(await collectGarbageUntil(() => ref.deref() === undefined)).toBe(true);
    // 没人来读这些 id，死槽不会自己消失
    expect(cache.size).toBe(ENTITY_IDENTITY_CACHE_SWEEP_FLOOR);

    // 再写满一批把总量推到 2×FLOOR，触发第二次扫描
    fillUnreferenced(cache, ENTITY_IDENTITY_CACHE_SWEEP_FLOOR, ENTITY_IDENTITY_CACHE_SWEEP_FLOOR);
    // 不扫描的话这里必然是 2×FLOOR（死槽只会累积，不会因为 GC 自己变少），
    // 所以 ≤ FLOOR 就是「扫描确实跑了且至少清掉了上一批」的证据。
    // 不写死等于 FLOOR：第二批也可能在填充途中被 minor GC 顺手收走一部分。
    expect(cache.size).toBeLessThanOrEqual(ENTITY_IDENTITY_CACHE_SWEEP_FLOOR);
  });

  it('扫描阈值随存活规模上浮，不会每次 set 都全表扫', async () => {
    const cache = new EntityIdentityCache<object>();
    const alive: object[] = [];
    for (let index = 0; index < ENTITY_IDENTITY_CACHE_SWEEP_FLOOR; index++) {
      const value = { index };
      alive.push(value);
      cache.set(`k${index}`, value);
    }
    // 第 FLOOR 次 set 扫过一遍，全部存活 → 阈值抬到 2×FLOOR
    expect(cache.size).toBe(ENTITY_IDENTITY_CACHE_SWEEP_FLOOR);

    const ref = setUnreferenced(cache, 'dead');
    expect(await collectGarbageUntil(() => ref.deref() === undefined)).toBe(true);

    // 只多了一个槽位，远没到新阈值：这一次 set 不该触发扫描
    cache.set('another', {});
    expect(cache.size).toBe(ENTITY_IDENTITY_CACHE_SWEEP_FLOOR + 2);
    expect(alive.length).toBe(ENTITY_IDENTITY_CACHE_SWEEP_FLOOR);
  });

  it('clear 之后扫描阈值退回下限', () => {
    const cache = new EntityIdentityCache<object>();
    const alive: object[] = [];
    for (let index = 0; index < ENTITY_IDENTITY_CACHE_SWEEP_FLOOR; index++) {
      const value = { index };
      alive.push(value);
      cache.set(`k${index}`, value);
    }
    cache.clear();

    expect(cache.size).toBe(0);
    // 阈值若不复位，清空后要再攒到 2×FLOOR 才肯扫一次，白白多留一倍死槽
    expect(cache.sweepThreshold).toBe(ENTITY_IDENTITY_CACHE_SWEEP_FLOOR);
    expect(alive.length).toBe(ENTITY_IDENTITY_CACHE_SWEEP_FLOOR);
  });
});
