import type { SupabaseEntityHistoryItem } from '@aiao/rxdb-adapter-supabase';
import { describe, expect, it } from 'vitest';
import { describeHistoryEntry, historyChanges } from './catalog-history-view';

const ME = '00000000-0000-4000-8000-0000000000a1';

function entry(overrides: Partial<SupabaseEntityHistoryItem>): SupabaseEntityHistoryItem {
  return {
    id: 1,
    changeId: 10,
    namespace: 'public',
    entity: 'CatalogItem',
    entityId: 'item-1',
    bucket: 'tenant:xinghe',
    type: 'UPDATE',
    patch: { price: 199 },
    inversePatch: { price: 299 },
    beforeData: { name: '耳机', price: 299, visibility: 'public', updatedAt: '2026-11-26T08:00:00Z' },
    afterData: { name: '耳机', price: 199, visibility: 'tenant', updatedAt: '2026-11-26T09:00:00Z' },
    actor: ME,
    role: 'authenticated',
    source: 'push',
    clientId: 'client-1',
    localId: 3,
    branchId: 'main',
    createdAt: new Date('2026-11-26T09:00:00Z'),
    ...overrides
  };
}

describe('catalog-history-view', () => {
  it('修改只列前后不一样的商品字段，簿记列不列，可见范围显示成中文', () => {
    expect(historyChanges(entry({}))).toEqual([
      { label: '售价', before: '299', after: '199' },
      { label: '可见范围', before: '公开', after: '仅租户内部' }
    ]);
  });

  it('新建列出建成的值，删除列出删掉前的值', () => {
    expect(historyChanges(entry({ type: 'INSERT', beforeData: null, afterData: { name: '新品', price: 99 } }))).toEqual([
      { label: '名称', before: '—', after: '新品' },
      { label: '售价', before: '—', after: '99' }
    ]);
    expect(historyChanges(entry({ type: 'DELETE', beforeData: { name: '旧品' }, afterData: null }))).toEqual([
      { label: '名称', before: '旧品', after: '—' }
    ]);
  });

  it('自己改的显示「我」，别人改的显示用户 id 前缀，服务端直写显示 service_role；种类与来源一起说', () => {
    expect(describeHistoryEntry(entry({}), ME)).toMatchObject({ id: 1, who: '我', what: '修改 · 本机推送' });
    expect(describeHistoryEntry(entry({ actor: 'bbbbbbbb-0000-4000-8000-000000000000', source: 'trigger' }), ME)).toMatchObject(
      { who: '用户 bbbbbbbb', what: '修改 · 直接写远端' }
    );
    expect(describeHistoryEntry(entry({ actor: null, type: 'DELETE', source: 'cascade' }), ME)).toMatchObject({
      who: '服务端（service_role）',
      what: '删除 · 随父行级联删除'
    });
  });
});
