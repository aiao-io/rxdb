import { getEntityMetadata } from '@aiao/rxdb';
import type { SupabaseRlsCheckOptions } from '@aiao/rxdb-adapter-supabase';
import { CatalogItem, PublicCatalogItem } from '@aiao/rxdb-test/entities';

/**
 * 连接远端时自检这些表开了 RLS。
 *
 * @remarks
 * 不查 `todos`：本地栈与适配器测试共用，参考 SQL 有意关了它的 RLS（适配器测试以 anon 直写 todos），
 * 每次加载都报一条已知的告警只会淹没真问题。页面顶部的安全提示写明了这一点。
 * 其余同步用到的表照常查：日志表、分支表、按身份分区的商品表与公开视图。表名取自实体，改表名不会漏查。
 */
export const DEMO_RLS_CHECK: SupabaseRlsCheckOptions = {
  tables: [
    { schema: 'public', table: 'rxdb_change' },
    { schema: 'public', table: 'rxdb_branch' },
    ...[CatalogItem, PublicCatalogItem].map(entity => ({
      schema: 'public',
      table: getEntityMetadata(entity).tableName
    }))
  ]
};
