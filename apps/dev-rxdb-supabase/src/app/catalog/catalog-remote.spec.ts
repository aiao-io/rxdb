import { describe, expect, it } from 'vitest';
import {
  fetchTenantItems,
  fetchTenantMembers,
  setMemberPermissions,
  updateItem,
  type CatalogRemoteClient
} from './catalog-remote';

type Call = readonly [method: string, args: readonly unknown[]];

/** PostgREST 查询替身：链上每一步都记下来并返回自己，`await` 拿到给定的结果；`rpc` 同样记下并直接给结果 */
function fakeClient(result: { data: unknown; error: { message: string } | null }) {
  const calls: Call[] = [];
  const builder = Object.assign(Promise.resolve(result), {} as Record<string, (...args: unknown[]) => unknown>);
  for (const method of ['select', 'update', 'eq', 'in', 'order']) {
    builder[method] = (...args: unknown[]) => {
      calls.push([method, args]);
      return builder;
    };
  }
  const client = {
    from: (table: string) => {
      calls.push(['from', [table]]);
      return builder;
    },
    rpc: (...args: unknown[]) => {
      calls.push(['rpc', args]);
      return Promise.resolve(result);
    }
  };
  return { client: client as unknown as CatalogRemoteClient, calls };
}

describe('成员权限（US-234）', () => {
  it('成员列表经 demo_tenant_member_list 读，匿名用户没有邮箱', async () => {
    const { client, calls } = fakeClient({
      data: [
        { user_id: 'u-bob', email: 'bob@example.com', permissions: ['read', 'edit', 'manage'], createdAt: '' },
        { user_id: 'u-anon', email: null, permissions: ['read'], createdAt: '' }
      ],
      error: null
    });

    expect(await fetchTenantMembers(client, 'jiguang')).toEqual([
      { userId: 'u-bob', email: 'bob@example.com', permissions: ['read', 'edit', 'manage'] },
      { userId: 'u-anon', email: null, permissions: ['read'] }
    ]);
    expect(calls).toEqual([['rpc', ['demo_tenant_member_list', { p_tenant_id: 'jiguang' }]]]);
  });

  it('改权限只经 demo_set_member_permissions；服务端拒绝（不是管理员、最后一个管理员）原样报出', async () => {
    const accepted = fakeClient({ data: null, error: null });
    await setMemberPermissions(accepted.client, 'jiguang', 'u-anon', ['read', 'edit', 'manage']);
    expect(accepted.calls).toEqual([
      [
        'rpc',
        [
          'demo_set_member_permissions',
          { p_tenant_id: 'jiguang', p_user_id: 'u-anon', p_permissions: ['read', 'edit', 'manage'] }
        ]
      ]
    ]);

    const rejected = fakeClient({
      data: null,
      error: { message: '不能撤掉最后一个管理员：租户 jiguang 至少要留一个管理员' }
    });
    await expect(setMemberPermissions(rejected.client, 'jiguang', 'u-bob', ['read'])).rejects.toThrow(
      '不能撤掉最后一个管理员'
    );
  });
});

const changes = { name: '星河 X1 蓝牙耳机（新款）', category: '数码', price: 279, cost: 110 };

describe('updateItem', () => {
  it('按 id 改这一行的名称、分类、售价与成本价', async () => {
    const { client, calls } = fakeClient({ data: [{ id: 'item-1' }], error: null });

    await updateItem(client, 'item-1', changes);

    expect(calls).toEqual([
      ['from', ['catalog_items']],
      ['update', [changes]],
      ['eq', ['id', 'item-1']],
      ['select', ['id']]
    ]);
  });

  // RLS 拦下的修改不报错、只是零行：不在这个租户了，或这一行已经被删掉
  it('一行都没改到就当成失败报出来', async () => {
    const { client } = fakeClient({ data: [], error: null });

    await expect(updateItem(client, 'item-1', changes)).rejects.toThrow('编辑失败');
  });

  it('服务端报错原样报出', async () => {
    const { client } = fakeClient({ data: null, error: { message: 'value too long for type character varying' } });

    await expect(updateItem(client, 'item-1', changes)).rejects.toThrow('value too long');
  });
});

describe('fetchTenantItems', () => {
  // 编辑框按服务端现值回填，成本价也要列出来
  it('列出所在租户的商品时带上成本价', async () => {
    const { client, calls } = fakeClient({ data: [], error: null });

    await fetchTenantItems(client, ['xinghe']);

    const [, [columns]] = calls.find(([method]) => method === 'select')!;
    expect(String(columns).split(', ')).toContain('cost');
  });
});
