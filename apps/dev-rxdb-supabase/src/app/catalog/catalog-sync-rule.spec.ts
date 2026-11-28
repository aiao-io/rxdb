import { isEntityMatchWhere } from '@aiao/rxdb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CATALOG_CATEGORIES,
  catalogSyncRule,
  DEFAULT_FOLLOWED_CATEGORIES,
  FollowedCategories
} from './catalog-sync-rule';

class MemoryStorage {
  readonly #values = new Map<string, string>();
  getItem(key: string): string | null {
    return this.#values.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.#values.set(key, value);
  }
}

describe('catalogSyncRule', () => {
  const item = (category: string, visibility: 'public' | 'tenant') => ({ category, visibility });

  it('公开商品只取关注的分类', () => {
    const rule = catalogSyncRule(['数码']);

    expect(isEntityMatchWhere(item('数码', 'public'), rule)).toBe(true);
    expect(isEntityMatchWhere(item('家居', 'public'), rule)).toBe(false);
  });

  it('租户内部商品不受规则限制：登录用户离线拥有所在租户的全部数据', () => {
    const rule = catalogSyncRule([]);

    expect(isEntityMatchWhere(item('家居', 'tenant'), rule)).toBe(true);
    expect(isEntityMatchWhere(item('家居', 'public'), rule)).toBe(false);
  });
});

describe('FollowedCategories', () => {
  const storageKey = 'dev-rxdb-supabase:catalog-followed:db';

  afterEach(() => vi.restoreAllMocks());

  it('第一次打开：默认关注的分类', () => {
    const followed = new FollowedCategories(new MemoryStorage(), 'db-anon');

    expect(followed.value()).toEqual(DEFAULT_FOLLOWED_CATEGORIES);
  });

  it('每个本地库各存一份：换身份就是另一份规则', () => {
    const storage = new MemoryStorage();
    new FollowedCategories(storage, 'db-alice').toggle('家居');

    expect(new FollowedCategories(storage, 'db-alice').value()).toEqual(['数码', '家居']);
    expect(new FollowedCategories(storage, 'db-bob').value()).toEqual(DEFAULT_FOLLOWED_CATEGORIES);
  });

  it('按分类表的顺序保存，去掉不认识的分类', () => {
    const storage = new MemoryStorage();
    storage.setItem(storageKey, JSON.stringify(['图书', '已下线', '数码', '图书']));

    expect(new FollowedCategories(storage, 'db').value()).toEqual(['数码', '图书']);
  });

  it('存的不是合法 JSON（被改坏了）：当作没存过，回到默认关注，警告一次并点名存储键', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const storage = new MemoryStorage();
    storage.setItem(storageKey, '["数码",');

    const followed = new FollowedCategories(storage, 'db');

    expect(followed.value()).toEqual(DEFAULT_FOLLOWED_CATEGORIES);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain(storageKey);
  });

  it('坏值被下一次关注的改动覆盖：之后读回来是好的，不再警告', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const storage = new MemoryStorage();
    storage.setItem(storageKey, 'not json');
    new FollowedCategories(storage, 'db').toggle('家居');
    warn.mockClear();

    expect(new FollowedCategories(storage, 'db').value()).toEqual(['数码', '家居']);
    expect(warn).not.toHaveBeenCalled();
  });

  it('合法的 JSON 但形状不对：照旧按没有关注任何分类处理，不算坏值、不警告', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const storage = new MemoryStorage();
    storage.setItem(storageKey, JSON.stringify({ 数码: true }));

    expect(new FollowedCategories(storage, 'db').value()).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
  });

  it('取消关注最后一个分类：公开商品一个都不同步', () => {
    const followed = new FollowedCategories(new MemoryStorage(), 'db');
    followed.toggle('数码');

    expect(followed.value()).toEqual([]);
  });

  it('分类表覆盖演示数据的四个分类', () => {
    expect(CATALOG_CATEGORIES).toEqual(['数码', '家居', '食品', '图书']);
  });
});
