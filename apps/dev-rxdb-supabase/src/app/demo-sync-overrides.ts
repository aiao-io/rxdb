import { SyncType, type EntitySyncOverride } from '@aiao/rxdb';
import { CatalogItem, PublicCatalogItem, Todo } from '@aiao/rxdb-test/entities';
import { catalogSyncRule } from './catalog/catalog-sync-rule';
import { ORDER_ENTITIES } from './orders/order-entities';
import type { DemoSessionIdentity } from './supabase-session';

/** 按身份定同步覆盖要用的会话信息 */
export interface DemoSyncOverrideSession {
  /** 会话属于哪一类身份 */
  readonly kind: DemoSessionIdentity['kind'];
  /** 这个身份当前关注的分类：商品同步规则在每轮拉取时读它 */
  readonly followed: () => readonly string[];
}

/**
 * 访客只存本地的实体
 *
 * @remarks
 * 它们走未分区的日志同步，只对登录身份开放（US-225）：访客没有推送权限，也读不到未分区日志。
 * 订单演示的三张表连 anon 的表权限都没有（`supabase/orders-demo.sql`）。
 */
export const VISITOR_LOCAL_ONLY_ENTITIES = [Todo, ...ORDER_ENTITIES] as const;

/**
 * 按身份给出的同步覆盖
 *
 * @param session - 远端模式的会话；本地模式（没有 Supabase 配置）为 `undefined`，此时根本不连远端
 * @returns 交给 `RxDBOptions.syncOverrides` 的覆盖
 *
 * @remarks
 * - 商品：按授权分区同步（US-033），规则在每轮拉取时读当前关注的分类。
 * - 公开商品：在线浏览规则之外的公开数据（US-036），QueryCache 每次查询都向远端校验。
 * - 访客的 {@link VISITOR_LOCAL_ONLY_ENTITIES} 只存本地；登录身份按库级配置全量同步它们。
 */
export function demoSyncOverrides(session: DemoSyncOverrideSession | undefined): EntitySyncOverride[] {
  const overrides: EntitySyncOverride[] = [
    {
      entity: CatalogItem,
      sync: {
        type: SyncType.Filter,
        local: { adapter: 'wa-sqlite' },
        remote: { adapter: 'supabase', filter: () => catalogSyncRule(session?.followed() ?? []) }
      }
    },
    {
      entity: PublicCatalogItem,
      sync: {
        type: SyncType.QueryCache,
        local: { adapter: 'wa-sqlite', syncStaleTime: 0 },
        remote: { adapter: 'supabase' }
      }
    }
  ];
  if (session?.kind !== 'visitor') return overrides;
  return [
    ...overrides,
    ...VISITOR_LOCAL_ONLY_ENTITIES.map((entity): EntitySyncOverride => ({
      entity,
      sync: { type: SyncType.None, local: { adapter: 'wa-sqlite' } }
    }))
  ];
}
