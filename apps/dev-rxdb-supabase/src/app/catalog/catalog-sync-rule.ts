import type { RuleGroup } from '@aiao/rxdb';
import { signal } from '@angular/core';

/** 演示数据的商品分类（`supabase/catalog-demo.sql`）。 */
export const CATALOG_CATEGORIES = ['数码', '家居', '食品', '图书'] as const;

/** 第一次打开时关注的分类。 */
export const DEFAULT_FOLLOWED_CATEGORIES: readonly string[] = ['数码'];

const STORAGE_KEY_PREFIX = 'dev-rxdb-supabase:catalog-followed:';

interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * 商品的同步规则（`SyncType.Filter` 的 `remote.filter`）。
 *
 * @param followed - 关注的分类
 * @returns 租户内部商品全量同步；公开商品只取关注的分类
 *
 * @remarks
 * 规则只在调用者能读的区里挑行（US-033）：把规则改宽扩大不了授权，访客永远拿不到租户内部商品。
 * 规则变了，下一轮同步按新的条件指纹对每个区补快照、清掉不再匹配的行。
 */
export function catalogSyncRule(followed: readonly string[]): RuleGroup {
  return {
    combinator: 'or',
    rules: [
      { field: 'visibility', operator: '=', value: 'tenant' },
      { field: 'category', operator: 'in', value: [...followed] }
    ]
  };
}

/**
 * 关注的分类：每个本地库（即每个身份）一份，存在浏览器里。
 *
 * @remarks
 * 同步规则在每轮拉取时求值，读的就是这里的当前值；界面改了关注，下一次同步生效。
 * 存着的值读不出来（不是合法 JSON）时当作没存过，回到默认关注并警告，详见构造函数。
 */
export class FollowedCategories {
  readonly #storage: KeyValueStorage;
  readonly #key: string;
  readonly #value = signal<readonly string[]>([]);

  /** 当前关注的分类，按 {@link CATALOG_CATEGORIES} 的顺序 */
  readonly value = this.#value.asReadonly();

  /**
   * @param storage - 持久化载体（生产传 `localStorage`）
   * @param databaseName - 本地库名：按身份算出，一个身份一份规则
   *
   * @remarks
   * 存的不是合法 JSON（被手工改坏，或被别的版本写成了别的东西）按没存过处理：关注的分类只是个演示偏好，
   * 坏值不该让远端模式整个起不来。坏值留在原处，警告点名存储键，下一次关注或取消关注时被覆盖。
   * 合法 JSON 但形状不对的值，照旧由 `normalize` 归一。
   */
  constructor(storage: KeyValueStorage, databaseName: string) {
    this.#storage = storage;
    this.#key = `${STORAGE_KEY_PREFIX}${databaseName}`;
    this.#value.set(readStored(storage, this.#key));
  }

  /** 关注或取消关注一个分类，并保存 */
  toggle(category: string): void {
    const current = this.#value();
    const next = current.includes(category) ? current.filter(item => item !== category) : [...current, category];
    const normalized = normalize(next);
    this.#value.set(normalized);
    this.#storage.setItem(this.#key, JSON.stringify(normalized));
  }
}

function readStored(storage: KeyValueStorage, key: string): readonly string[] {
  const stored = storage.getItem(key);
  if (stored === null) return DEFAULT_FOLLOWED_CATEGORIES;
  let parsed: unknown;
  try {
    parsed = JSON.parse(stored);
  } catch {
    console.warn(`浏览器里存的 ${key} 不是合法的 JSON，已当作没存过，改用默认关注的分类`);
    return DEFAULT_FOLLOWED_CATEGORIES;
  }
  return normalize(parsed);
}

function normalize(value: unknown): readonly string[] {
  const entries = Array.isArray(value) ? value : [];
  return CATALOG_CATEGORIES.filter(category => entries.includes(category));
}
