import { isEntityMatchWhere } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { CATALOG_CATEGORIES, catalogSyncRule, DEFAULT_FOLLOWED_CATEGORIES, FollowedCategories } from './catalog-sync-rule';

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
    storage.setItem('dev-rxdb-supabase:catalog-followed:db', JSON.stringify(['图书', '已下线', '数码', '图书']));

    expect(new FollowedCategories(storage, 'db').value()).toEqual(['数码', '图书']);
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
