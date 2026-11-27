import { RxDB, SyncType, type EntityType } from '@aiao/rxdb';
import { RxDBAdapterElectron, type DesktopHostTransport } from '@aiao/rxdb-adapter-electron';
import { createElectronSqliteHost } from '@aiao/rxdb-adapter-electron/host';
import { rxDBPluginTree } from '@aiao/rxdb-plugin-tree';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** 用当前仓库的 SQLite 宿主验证原设计器实体和查询。 */
export async function createTestDatabase(
  entities: EntityType[]
): Promise<{ database: RxDB; dispose: () => Promise<void> }> {
  const directory = mkdtempSync(join(tmpdir(), 'aiao-model-design-'));
  const listeners = new Set<(message: unknown) => void>();
  const host = createElectronSqliteHost({
    resolveDatabasePath: name => join(directory, name),
    postChange: message => {
      for (const listener of listeners) listener(message);
    }
  });
  const transport: DesktopHostTransport = {
    request: payload => host.handle(payload),
    subscribe: listener => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
  const database = new RxDB({
    dbName: 'designer-integration',
    entities,
    sync: { type: SyncType.None, local: { adapter: 'sqlite-electron' } }
  });
  database.use(rxDBPluginTree).adapter('sqlite-electron', db => new RxDBAdapterElectron(db, { transport }));
  await database.connect('sqlite-electron');
  return {
    database,
    dispose: async () => {
      await database.destroy();
      host.closeAll();
      rmSync(directory, { recursive: true, force: true });
    }
  };
}
