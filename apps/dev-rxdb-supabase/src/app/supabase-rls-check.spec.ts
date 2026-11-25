import { getEntityMetadata, type EntityType } from '@aiao/rxdb';
import { CatalogItem, PublicCatalogItem, Todo } from '@aiao/rxdb-test/entities';
import { describe, expect, it } from 'vitest';
import { DemoCategory, DemoCustomer, DemoOrder, DemoOrderItem } from './orders/order-entities';
import { DEMO_RLS_CHECK } from './supabase-rls-check';

const tableOf = (entity: EntityType) => ({
  schema: 'public',
  table: getEntityMetadata(entity).tableName
});

describe('DEMO_RLS_CHECK', () => {
  it('不查 todos：本地栈与适配器测试共用，SQL 有意关了它的 RLS', () => {
    expect(DEMO_RLS_CHECK.tables).not.toContainEqual(tableOf(Todo));
  });

  it('日志表、分支表、按身份分区的商品表、公开视图与订单演示的表（含订单项—分类的中间表）照常自检', () => {
    expect(DEMO_RLS_CHECK.tables).toEqual([
      { schema: 'public', table: 'rxdb_change' },
      { schema: 'public', table: 'rxdb_branch' },
      tableOf(CatalogItem),
      tableOf(PublicCatalogItem),
      tableOf(DemoOrderItem),
      tableOf(DemoOrder),
      tableOf(DemoCustomer),
      tableOf(DemoCategory),
      { schema: 'public', table: 'DemoCategory_DemoOrderItem' }
    ]);
  });

  it('自检不通过只告警、不阻断连接（与适配器默认一致）', () => {
    expect(DEMO_RLS_CHECK.failureMode).toBeUndefined();
  });
});
