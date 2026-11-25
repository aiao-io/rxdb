/**
 * @fileoverview dev-rxdb-supabase 订单演示的表权限（US-227 AC#6）—— 真实 Supabase 栈
 *
 * @remarks
 * `apps/dev-rxdb-supabase/supabase/orders-demo.sql` 建的表（含订单项—分类的中间表）：都开了 RLS（demo 连接时的 RLS 自检读的就是
 * `rxdb_check_rls` 的结果），anon 没有表权限，已登录身份能读。只读，不写一行。
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { signTestAccessToken } from './test-utils.js';

const SUPABASE_URL = import.meta.env['VITE_SUPABASE_URL'] || '';
const SUPABASE_KEY = import.meta.env['VITE_SUPABASE_KEY'] || '';

const ORDER_TABLES = [
  'demo_customers',
  'demo_orders',
  'demo_order_items',
  'demo_categories',
  'DemoCategory_DemoOrderItem'
] as const;

describe.skipIf(!SUPABASE_URL || !SUPABASE_KEY)('订单演示的表权限（US-227 AC#6）', () => {
  function client(user: string | null): SupabaseClient {
    return createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      ...(user ? { accessToken: () => signTestAccessToken(user) } : {})
    });
  }

  it('每张表都开了 RLS：与 demo 连接时的自检同一个 RPC', async () => {
    const { data, error } = await client(null).rpc('rxdb_check_rls', {
      p_tables: ORDER_TABLES.map(table => ({ schema: 'public', table }))
    });

    expect(error, 'orders-demo.sql 缺失：先用 nx run rxdb-adapter-supabase:test-env 初始化测试栈').toBeNull();
    expect(data).toEqual(
      ORDER_TABLES.map(table =>
        expect.objectContaining({ table, exists: true, rlsEnabled: true, relationKind: 'table' })
      )
    );
  });

  it('anon 没有表权限：直接读得到 42501，访客的订单只能存在本机', async () => {
    const anon = client(null);
    for (const table of ORDER_TABLES) {
      const { error } = await anon.from(table).select('id').limit(1);
      expect(error, table).toMatchObject({ code: '42501' });
    }
  });

  it('已登录身份读得到每张表（演示里 Alice 与 Bob 共享全部订单）', async () => {
    const member = client(crypto.randomUUID());
    for (const table of ORDER_TABLES) {
      const { error } = await member.from(table).select('id').limit(1);
      expect(error, table).toBeNull();
    }
  });
});
