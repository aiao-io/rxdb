import {
  createEntitySyncResolver,
  getEntityMetadata,
  SyncType,
  type EntityMetadata,
  type RuleGroup,
  type SyncOptions
} from '@aiao/rxdb';
import { CatalogItem, PublicCatalogItem, Todo } from '@aiao/rxdb-test/entities';
import { describe, expect, it } from 'vitest';
import { demoSyncOverrides, VISITOR_LOCAL_ONLY_ENTITIES } from './demo-sync-overrides';
import { DemoCategory, DemoCustomer, DemoOrder, DemoOrderItem } from './orders/order-entities';

const LOCAL_ONLY = { type: SyncType.None, local: { adapter: 'wa-sqlite' } };

function overrideOf(overrides: ReturnType<typeof demoSyncOverrides>, entity: unknown) {
  return overrides.find(item => item.entity === entity)?.sync;
}

describe('demoSyncOverrides', () => {
  it('访客的 Todo 与订单演示的四个实体只存本地：它们走未分区的日志同步，只对登录身份开放（US-225）', () => {
    const overrides = demoSyncOverrides({ kind: 'visitor', followed: () => ['数码'] });

    expect(VISITOR_LOCAL_ONLY_ENTITIES).toEqual([Todo, DemoOrderItem, DemoOrder, DemoCustomer, DemoCategory]);
    for (const entity of VISITOR_LOCAL_ONLY_ENTITIES) {
      expect(overrideOf(overrides, entity)).toEqual(LOCAL_ONLY);
    }
  });

  it('订单项—分类的中间表跟着两端（US-228）：访客只存本地，登录身份全量同步', () => {
    // 与 setup_rxdb_wa-sqlite.ts 的库级配置相同；中间表由 RxDB 在 init() 时生成，这里按名字与两端模拟它
    const databaseSync: SyncOptions = {
      type: SyncType.Full,
      local: { adapter: 'wa-sqlite' },
      remote: { adapter: 'supabase' }
    };
    const junction = { namespace: 'public', name: 'DemoCategory_DemoOrderItem' } as EntityMetadata;
    const endpoints = [getEntityMetadata(DemoCategory), getEntityMetadata(DemoOrderItem)];
    const junctionTypeFor = (kind: 'visitor' | 'account') =>
      createEntitySyncResolver(
        databaseSync,
        new Map(
          demoSyncOverrides({ kind, followed: () => [] }).map(item => [getEntityMetadata(item.entity), item.sync])
        ),
        metadata => (metadata === junction ? endpoints : undefined)
      ).resolveType(junction);

    expect(junctionTypeFor('visitor')).toBe('local');
    expect(junctionTypeFor('account')).toBe('full');
  });

  it('登录身份（匿名用户或账号）按库级配置全量同步 Todo 与订单', () => {
    for (const kind of ['anonymous', 'account'] as const) {
      const overrides = demoSyncOverrides({ kind, followed: () => [] });
      for (const entity of VISITOR_LOCAL_ONLY_ENTITIES) {
        expect(overrideOf(overrides, entity)).toBeUndefined();
      }
    }
  });

  it('商品按授权分区同步，规则在每轮拉取时读当前关注的分类；公开商品走 QueryCache 在线浏览', () => {
    let followed: readonly string[] = ['数码'];
    const overrides = demoSyncOverrides({ kind: 'account', followed: () => followed });

    const catalog = overrideOf(overrides, CatalogItem);
    expect(catalog).toMatchObject({ type: SyncType.Filter, local: { adapter: 'wa-sqlite' } });
    const filter = (catalog?.remote as { filter: () => RuleGroup }).filter;
    followed = ['家居', '图书'];
    expect(filter().rules).toContainEqual({ field: 'category', operator: 'in', value: ['家居', '图书'] });

    expect(overrideOf(overrides, PublicCatalogItem)).toEqual({
      type: SyncType.QueryCache,
      local: { adapter: 'wa-sqlite', syncStaleTime: 0 },
      remote: { adapter: 'supabase' }
    });
  });

  it('本地模式（没有 Supabase 会话）不加只存本地的覆盖：根本不连远端', () => {
    const overrides = demoSyncOverrides(undefined);

    expect(overrides.map(item => item.entity)).toEqual([CatalogItem, PublicCatalogItem]);
    const filter = (overrideOf(overrides, CatalogItem)?.remote as { filter: () => RuleGroup }).filter;
    expect(filter().rules).toContainEqual({ field: 'category', operator: 'in', value: [] });
  });
});
