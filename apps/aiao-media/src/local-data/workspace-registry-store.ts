import { Entity, EntityBase, PropertyType, RxDB, SyncType, type RxDBEvent, type UUID } from '@aiao/rxdb';
import { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';
import { firstValueFrom, map, type Observable } from 'rxjs';
import { localRepository } from './local-repository';
import type { WorkspaceRegistryState } from './workspace-registry';

function registryModels() {
  @Entity({
    name: 'WorkspaceRegistryGroup',
    tableName: 'workspace_registry_group',
    namespace: 'media',
    log: false,
    sync: { type: SyncType.None },
    properties: [
      { name: 'payload', type: PropertyType.string, required: true },
      { name: 'revision', type: PropertyType.integer, required: true }
    ]
  })
  class Group extends EntityBase {
    payload!: string;
    revision!: number;
  }
  @Entity({
    name: 'WorkspaceRegistryAlias',
    tableName: 'workspace_registry_alias',
    namespace: 'media',
    log: false,
    sync: { type: SyncType.None },
    properties: [
      { name: 'profileId', type: PropertyType.uuid, required: true },
      { name: 'rootId', type: PropertyType.uuid, required: true }
    ],
    indexes: [{ name: 'workspace_alias_profile', properties: ['profileId'], unique: true }]
  })
  class Alias extends EntityBase {
    profileId!: string;
    rootId!: string;
  }
  return { Group, Alias };
}

/** 全局本机命名空间索引；不保存会话、供应商凭据或文件内容。 */
export class WorkspaceRegistryStore {
  private constructor(
    private readonly db: RxDB,
    private readonly types: ReturnType<typeof registryModels>
  ) {}
  static async open(): Promise<WorkspaceRegistryStore> {
    const types = registryModels();
    const db = new RxDB({
      dbName: 'aiao-media-workspaces-v1',
      context: { userId: '00000000-0000-4000-8000-000000000000' },
      entities: [types.Group, types.Alias],
      sync: { type: SyncType.None, local: { adapter: 'wa-sqlite' } }
    });
    db.adapter(
      'wa-sqlite',
      host =>
        new RxDBAdapterWaSqlite(host, {
          vfs: 'IDBBatchAtomicVFS',
          async: true,
          wasmPath: '/wa-sqlite/wa-sqlite-async.wasm'
        })
    );
    try {
      await db.connect('wa-sqlite');
      return new WorkspaceRegistryStore(db, types);
    } catch (error) {
      await db.disconnectAll();
      throw error;
    }
  }
  async rootOf(profileId: string): Promise<string> {
    const adapter = await firstValueFrom(this.db.localAdapter$);
    const [row] = await adapter
      .getRepository(this.types.Alias)
      .find({ where: { combinator: 'and', rules: [{ field: 'profileId', operator: '=', value: profileId }] } });
    return row?.rootId ?? profileId;
  }
  async read(rootId: string): Promise<{ payload: string; revision: number } | null> {
    const adapter = await firstValueFrom(this.db.localAdapter$);
    const [row] = await adapter
      .getRepository(this.types.Group)
      .find({ where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: rootId as UUID }] } });
    if (row) return { payload: row.payload, revision: row.revision };
    const aliases = await adapter
      .getRepository(this.types.Alias)
      .find({ where: { combinator: 'and', rules: [{ field: 'rootId', operator: '=', value: rootId }] }, limit: 1 });
    if (aliases.length) throw new Error('工作区注册表缺失；原副本保留，未重新分配归属。');
    return null;
  }
  async write(rootId: string, payload: string, revision: number | null): Promise<void> {
    const state = JSON.parse(payload) as WorkspaceRegistryState;
    const adapter = await firstValueFrom(this.db.localAdapter$),
      events: RxDBEvent[] = [];
    await adapter.transaction(async executor => {
      const groups = localRepository(this.types.Group, executor.getRepository(this.types.Group), event =>
        events.push(event)
      );
      const aliases = localRepository(this.types.Alias, executor.getRepository(this.types.Alias), event =>
        events.push(event)
      );
      const [old] = await groups.find({
        where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: rootId as UUID }] }
      });
      if ((old?.revision ?? null) !== revision) throw new Error('另一窗口已更新工作区注册表。');
      if (old) await groups.update(old, { payload, revision: old.revision + 1 });
      else
        await groups.create(
          this.db.entityManager.instantiate(this.types.Group, { id: rootId as UUID, payload, revision: 1 })
        );
      for (const profile of state.profiles) {
        const [alias] = await aliases.find({
          where: { combinator: 'and', rules: [{ field: 'profileId', operator: '=', value: profile.id }] }
        });
        if (alias && alias.rootId !== rootId) throw new Error('此本机副本已属于另一工作区组。');
        if (!alias)
          await aliases.create(this.db.entityManager.instantiate(this.types.Alias, { profileId: profile.id, rootId }));
      }
    });
    for (const event of events) this.db.dispatchEvent(event);
  }
  watch(rootId: string): Observable<string | null> {
    return this.db.entityManager
      .getRepository(this.types.Group)
      .findOne({ where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: rootId as UUID }] } })
      .pipe(map(row => row?.payload ?? null));
  }
  close(): Promise<void> {
    return this.db.disconnectAll();
  }
}
