/**
 * @fileoverview 授权快照演示（US-029）的演示目标、授权预设、示例数据与状态文字
 *
 * 三端 demo 各一份、内容相同（与 `grant-demo.ts` 一起改）。
 */
import { RxDBGrantSnapshot, type EntityType, type RxDB } from '@aiao/rxdb';
import { TenantNote, Todo } from '@aiao/rxdb-test/entities';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { describeSnapshot, findGrantDemoTarget, grantPreset, seedScopedRows } from './grant-demo';

const ENTITIES = [Todo, TenantNote] as unknown as EntityType[];
const SCOPE = { property: 'tenantId', prefix: 'tenant:' };

/** 系统写收到的批：只关心 create 里落了哪些行 */
interface SeedBatch {
  readonly create: Map<unknown, Set<Record<string, unknown>>>;
  readonly update: Map<unknown, unknown>;
  readonly remove: Map<unknown, unknown>;
}

describe('授权快照演示（US-029）', () => {
  it('演示实体 TenantNote 是演示目标；别的实体、别的 namespace 不是', () => {
    expect(findGrantDemoTarget(ENTITIES, 'public', 'TenantNote')).toEqual({ entity: TenantNote, scope: SCOPE });
    expect(findGrantDemoTarget(ENTITIES, 'public', 'Todo')).toBeUndefined();
    expect(findGrantDemoTarget(ENTITIES, 'other', 'TenantNote')).toBeUndefined();
  });

  it('两组授权：a 可编辑、b 只读；收回 a 的 edit 后两者都只有 read', () => {
    expect(grantPreset('a-editable', SCOPE)).toEqual([
      { scope: 'tenant:a', permissions: ['read', 'edit'] },
      { scope: 'tenant:b', permissions: ['read'] }
    ]);
    expect(grantPreset('a-revoked', SCOPE)).toEqual([
      { scope: 'tenant:a', permissions: ['read'] },
      { scope: 'tenant:b', permissions: ['read'] }
    ]);
  });

  it('示例数据经本地适配器的 mutations() 落 a、b 各一行（系统写，不经公开写入口）', async () => {
    const mutations = vi.fn<(batch: SeedBatch) => Promise<void>>(async () => undefined);
    class Row {
      constructor(data: Record<string, unknown>) {
        Object.assign(this, data);
      }
    }
    const rxdb = { localAdapter$: of({ mutations }) } as unknown as RxDB;

    await seedScopedRows(rxdb, { entity: Row as unknown as EntityType, scope: SCOPE });

    const [batch] = mutations.mock.calls[0];
    expect([...(batch.create.get(Row) ?? [])].map(row => [row['tenantId'], row['title']])).toEqual([
      ['a', 'a-note'],
      ['b', 'b-note']
    ]);
    expect([batch.update.size, batch.remove.size]).toEqual([0, 0]);
  });

  it('状态：未取到、已取到但为空给文案键，有作用域时逐个列出权限', () => {
    const known = (grants: Parameters<typeof RxDBGrantSnapshot.known>[0]) =>
      RxDBGrantSnapshot.known(grants, 'app', new Date(0));

    expect(describeSnapshot(RxDBGrantSnapshot.UNKNOWN)).toEqual({
      kind: 'message',
      key: 'page.entity.grantDemo.unknown'
    });
    expect(describeSnapshot(known([]))).toEqual({ kind: 'message', key: 'page.entity.grantDemo.empty' });
    expect(describeSnapshot(known(grantPreset('a-editable', SCOPE)))).toEqual({
      kind: 'grants',
      text: 'tenant:a: edit, read; tenant:b: read'
    });
  });
});
