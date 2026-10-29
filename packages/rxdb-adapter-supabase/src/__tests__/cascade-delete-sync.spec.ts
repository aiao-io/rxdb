import { Entity, EntityBase, PropertyType, RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { rxDBPluginSync } from '@aiao/rxdb-plugin-sync';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterSupabase } from '../index.js';
import { getSupabaseServiceRoleClient } from './test-utils.js';
import { asyncWasmPath } from './wa-sqlite-wasm.js';

const SUPABASE_URL = import.meta.env['VITE_SUPABASE_URL'] || '';
const SUPABASE_KEY = import.meta.env['VITE_SUPABASE_KEY'] || '';

// 本地只存普通 parentId，避免本地级联掩盖服务端漏记子行日志。
@Entity({
  name: 'MenuLarge',
  tableName: 'menu_large',
  properties: [
    { name: 'title', type: PropertyType.string },
    { name: 'parentId', type: PropertyType.uuid, nullable: true }
  ]
})
class CascadeMenu extends EntityBase {
  declare title: string;
  declare parentId: string | null;
}

interface CascadeClient {
  rxdb: RxDB;
  local: RxDBAdapterWaSqlite;
  remote: RxDBAdapterSupabase;
}

describe.skipIf(!SUPABASE_URL || !SUPABASE_KEY)('Supabase 级联删除同步（US-224）', () => {
  const runId = crypto.randomUUID();
  const parentId = crypto.randomUUID();
  const childIds = [crypto.randomUUID(), crypto.randomUUID()];
  const entityIds = [parentId, ...childIds];
  const mixedParentId = crypto.randomUUID();
  const existingChildId = crypto.randomUUID();
  const newChildId = crypto.randomUUID();
  const mixedEntityIds = [mixedParentId, existingChildId, newChildId];
  const allEntityIds = [...entityIds, ...mixedEntityIds];
  const databases: RxDB[] = [];
  let clientA: CascadeClient;
  let clientB: CascadeClient;

  async function createClient(name: string): Promise<CascadeClient> {
    const rxdb = new RxDB({
      dbName: `us224-${runId.replaceAll('-', '')}-${name}`,
      context: { userId: crypto.randomUUID() },
      entities: [CascadeMenu],
      sync: {
        type: SyncType.Full,
        local: { adapter: 'wa-sqlite' },
        remote: { adapter: 'supabase' }
      }
    });
    databases.push(rxdb);
    rxdb.adapter(
      'wa-sqlite',
      db =>
        new RxDBAdapterWaSqlite(db, {
          vfs: 'MemoryAsyncVFS',
          async: true,
          worker: false,
          wasmPath: asyncWasmPath
        })
    );
    rxdb.adapter(
      'supabase',
      db => new RxDBAdapterSupabase(db, { supabaseUrl: SUPABASE_URL, supabaseKey: SUPABASE_KEY })
    );
    rxdb.use(rxDBPluginHistory);
    rxdb.use(rxDBPluginSync);
    await rxdb.connect('wa-sqlite');
    return {
      rxdb,
      local: (await rxdb.getAdapter('wa-sqlite')) as RxDBAdapterWaSqlite,
      remote: (await rxdb.getAdapter('supabase')) as RxDBAdapterSupabase
    };
  }

  async function localIds(client: CascadeClient, ids: string[] = entityIds): Promise<string[]> {
    const rows = await client.local.getRepository(CascadeMenu).find({
      where: { combinator: 'and', rules: [{ field: 'id', operator: 'in', value: ids }] }
    });
    return rows.map(row => row.id).sort();
  }

  async function remoteDeletes() {
    const { data, error } = await clientA.remote.client
      .from('rxdb_change')
      .select('entityId, clientId, localId')
      .eq('namespace', 'public')
      .eq('entity', 'MenuLarge')
      .eq('type', 'DELETE')
      .in('entityId', entityIds);
    if (error) throw error;
    return data;
  }

  beforeAll(async () => {
    clientA = await createClient('a');
    clientB = await createClient('b');
  });

  afterAll(async () => {
    try {
      const serviceRole = getSupabaseServiceRoleClient();
      const { error: entityError } = await serviceRole.from('menu_large').delete().in('id', allEntityIds);
      if (entityError) throw entityError;
      const { error: logError } = await serviceRole.from('rxdb_change').delete().in('entityId', allEntityIds);
      if (logError) throw logError;
    } finally {
      for (const database of databases) await database.disconnectAll();
    }
  });

  it('A 只推父行删除后，B 与 A 都能拉取服务端生成的子行删除', async () => {
    expect(clientA.rxdb.context.clientId).not.toBe(clientB.rxdb.context.clientId);
    const parent = clientA.rxdb.entityManager.instantiate(CascadeMenu, {
      id: parentId,
      title: 'cascade-parent',
      parentId: null
    });
    await parent.save();
    for (const childId of childIds) {
      const child = clientA.rxdb.entityManager.instantiate(CascadeMenu, {
        id: childId,
        title: 'cascade-child',
        parentId
      });
      await child.save();
    }

    const initialPush = await clientA.rxdb.syncManager.pushRepository('public', 'MenuLarge');
    expect(initialPush).toMatchObject({ pushed: 3, failed: 0 });
    await clientB.rxdb.syncManager.pullRepository('public', 'MenuLarge');
    expect(await localIds(clientB)).toEqual([...entityIds].sort());

    await parent.remove();
    expect(await localIds(clientA)).toEqual([...childIds].sort());
    const deletePush = await clientA.rxdb.syncManager.pushRepository('public', 'MenuLarge');
    expect(deletePush).toMatchObject({ originalCount: 1, pushed: 1, failed: 0 });
    expect(await localIds(clientA)).toEqual([...childIds].sort());

    const deletes = await remoteDeletes();
    expect(deletes).toHaveLength(3);
    expect(deletes.find(change => change.entityId === parentId)).toMatchObject({
      clientId: clientA.rxdb.context.clientId
    });
    expect(deletes.filter(change => childIds.includes(change.entityId))).toEqual(
      expect.arrayContaining(childIds.map(entityId => ({ entityId, clientId: null, localId: null })))
    );

    const pullB = await clientB.rxdb.syncManager.pullRepository('public', 'MenuLarge');
    expect(pullB.applied).toBe(3);
    expect(await localIds(clientB)).toEqual([]);

    const pullA = await clientA.rxdb.syncManager.pullRepository('public', 'MenuLarge');
    expect(pullA.applied).toBe(2);
    expect(await localIds(clientA)).toEqual([]);
    const nextPush = await clientA.rxdb.syncManager.pushRepository('public', 'MenuLarge');
    expect(nextPush).toMatchObject({ originalCount: 0, pushed: 0, failed: 0 });
    expect(await remoteDeletes()).toHaveLength(3);
  });

  it('同批新增和修改子行再删父行时，DELETE 排在源写入后且两端都不复活子行', async () => {
    const parent = clientA.rxdb.entityManager.instantiate(CascadeMenu, {
      id: mixedParentId,
      title: 'mixed-parent',
      parentId: null
    });
    const existingChild = clientA.rxdb.entityManager.instantiate(CascadeMenu, {
      id: existingChildId,
      title: 'mixed-existing-child',
      parentId: mixedParentId
    });
    await parent.save();
    await existingChild.save();
    const initialPush = await clientA.rxdb.syncManager.pushRepository('public', 'MenuLarge');
    expect(initialPush).toMatchObject({ pushed: 2, failed: 0 });
    await clientB.rxdb.syncManager.pullRepository('public', 'MenuLarge');
    expect(await localIds(clientB, mixedEntityIds)).toEqual([mixedParentId, existingChildId].sort());

    const newChild = clientA.rxdb.entityManager.instantiate(CascadeMenu, {
      id: newChildId,
      title: 'mixed-new-child',
      parentId: mixedParentId
    });
    await newChild.save();
    existingChild.title = 'mixed-existing-child-updated';
    await existingChild.save();
    await parent.remove();

    const mixedPush = await clientA.rxdb.syncManager.pushRepository('public', 'MenuLarge', {
      includeRelated: false
    });
    expect(mixedPush).toMatchObject({ originalCount: 3, pushed: 3, failed: 0 });
    expect(await localIds(clientA, mixedEntityIds)).toEqual([existingChildId, newChildId].sort());

    const { data: changes, error } = await clientA.remote.client
      .from('rxdb_change')
      .select('id, entityId, type, clientId, localId')
      .eq('namespace', 'public')
      .eq('entity', 'MenuLarge')
      .in('entityId', mixedEntityIds)
      .order('id', { ascending: true });
    if (error) throw error;
    expect(changes.filter(change => change.entityId === newChildId).map(change => change.type)).toEqual([
      'INSERT',
      'DELETE'
    ]);
    expect(changes.filter(change => change.entityId === existingChildId).map(change => change.type)).toEqual([
      'INSERT',
      'UPDATE',
      'DELETE'
    ]);
    const deletedChildren = changes.filter(change => change.type === 'DELETE' && change.entityId !== mixedParentId);
    expect(deletedChildren).toHaveLength(2);
    expect(deletedChildren.every(change => change.clientId === null && change.localId === null)).toBe(true);

    await clientB.rxdb.syncManager.pullRepository('public', 'MenuLarge');
    expect(await localIds(clientB, mixedEntityIds)).toEqual([]);
    await clientA.rxdb.syncManager.pullRepository('public', 'MenuLarge');
    expect(await localIds(clientA, mixedEntityIds)).toEqual([]);
    const nextPush = await clientA.rxdb.syncManager.pushRepository('public', 'MenuLarge');
    expect(nextPush).toMatchObject({ originalCount: 0, pushed: 0, failed: 0 });
  });
});
