// @vitest-environment node

import { RxDB, SyncType } from '@aiao/rxdb';
import { ELECTRON_ADAPTER_NAME, RxDBAdapterElectron, type DesktopHostTransport } from '@aiao/rxdb-adapter-electron';
import { createElectronFileHost, createElectronSqliteHost } from '@aiao/rxdb-adapter-electron/host';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createDesktopStorageFilesystem } from '../desktop.js';
import { rxDBPluginStorage } from '../plugin.js';

async function createNativeStorage() {
  const workspace = await mkdtemp(join(tmpdir(), 'rxdb-review-native-alias-'));
  const files = createElectronFileHost({ resolveStorageRoot: () => join(workspace, 'rxdb-files') });
  const sqlite = createElectronSqliteHost({
    resolveDatabasePath: name => join(workspace, name),
    postChange: () => undefined
  });
  const transport: DesktopHostTransport = {
    request: payload => payload.kind.startsWith('file.') ? files.handle(payload) : sqlite.handle(payload),
    subscribe: () => () => undefined
  };
  const db = new RxDB({
    dbName: `review-alias-${crypto.randomUUID()}`,
    entities: [],
    multiInstance: false,
    sync: { type: SyncType.None, local: { adapter: ELECTRON_ADAPTER_NAME } }
  });
  db.adapter(ELECTRON_ADAPTER_NAME, rxdb => new RxDBAdapterElectron(rxdb, { transport, databaseName: 'review.sqlite3' }));
  db.use(rxDBPluginStorage, { rootDir: 'files', filesystem: createDesktopStorageFilesystem({ transport }) });
  try {
    await db.connect(ELECTRON_ADAPTER_NAME);
  } catch (error) {
    await db.destroy();
    files.closeAll();
    sqlite.closeAll();
    await rm(workspace, { recursive: true, force: true });
    throw error;
  }
  return {
    db,
    workspace,
    async close(): Promise<void> {
      await db.destroy();
      files.closeAll();
      sqlite.closeAll();
      await rm(workspace, { recursive: true, force: true });
    }
  };
}

describe('评审：桌面物理路径不能让不同逻辑名覆盖同一个文件', () => {
  it.each([
    ['ASCII 大小写', 'a.txt', 'A.txt'],
    ['Unicode 规范等价', 'caf\u00e9.txt', 'cafe\u0301.txt'],
    ['正常不同文件名对照', 'alpha.txt', 'beta.txt']
  ] as const)('%s：overwrite 只允许替换目标逻辑路径，不能修改另一记录', async (scenario, firstName, secondName) => {
    const native = await createNativeStorage();
    try {
      const first = await native.db.storage.upload(new File(['first-original'], firstName, { type: 'text/plain' }));
      const second = await native.db.storage.upload(new File(['second-replacement'], secondName, { type: 'text/plain' }), { overwrite: true });
      const firstBytes = await (await native.db.storage.read(first.id)).text();
      const secondBytes = await (await native.db.storage.read(second.id)).text();
      const metas = await native.db.storage.listAllMetas();
      const diskNames = await readdir(join(native.workspace, 'rxdb-files', 'files'));
      console.log('REVIEW_NATIVE_ALIAS ' + JSON.stringify({ scenario, firstName, secondName, firstBytes, secondBytes, metadataRows: metas.length, diskNames }));
      expect(metas).toHaveLength(2);
      expect(second.id).not.toBe(first.id);
      expect(firstBytes).toBe('first-original');
      expect(secondBytes).toBe('second-replacement');
    } finally {
      await native.close();
    }
  });
});
