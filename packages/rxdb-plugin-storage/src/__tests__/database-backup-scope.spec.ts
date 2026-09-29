// @vitest-environment node
/**
 * US-217 AC#14：启用本插件、库里引用着外置文件时，数据库备份只含数据库。
 *
 * @remarks
 * 跑在真实的桌面组合上：renderer 侧 `RxDBAdapterElectron` 经直连传输打到 `node:sqlite` host，文件内容经桌面文件 host
 * 落在同一个工作区的 `rxdb-files/` 下——这正是「拷一个目录就带走全部应用数据」的布局，也是最容易把数据库备份误当成
 * 应用备份的地方。用例从三处核对范围：备份结果、归档里的 manifest 与条目、以及恢复到新位置之后文件本体是否还在。
 */
import {
  RXDB_BACKUP_SCOPE,
  RxDB,
  RxDBBackupArchiveReader,
  SyncType,
  type RxDBBackupEntryHeader,
  type RxDBBackupManifest
} from '@aiao/rxdb';
import { ELECTRON_ADAPTER_NAME, RxDBAdapterElectron } from '@aiao/rxdb-adapter-electron';
import { createElectronFileHost, createElectronSqliteHost } from '@aiao/rxdb-adapter-electron/host';
import type { RxDBAdapterSqliteBase } from '@aiao/rxdb-adapter-sqlite-core';
import type { DesktopHostTransport } from '@aiao/rxdb-adapter-sqlite-core/desktop-host';
import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createDesktopStorageFilesystem } from '../desktop.js';
import { rxDBPluginStorage } from '../plugin.js';

const DB_NAME = 'backup-scope';
const FILES_DIRECTORY = 'rxdb-files';

/** 文件内容里的哨兵：归档里出现它，就说明文件本体被带进了数据库备份。 */
const CONTENT_SENTINEL = 'EXTERNAL-FILE-CONTENT-7f3a9c';

/** 一个工作区上的桌面应用：库文件与外置文件同在 `root` 下。 */
interface DesktopApp {
  readonly root: string;
  readonly rxdb: RxDB;
  readonly adapter: () => Promise<RxDBAdapterSqliteBase>;
  readonly close: () => Promise<void>;
}

const workspaces: string[] = [];

afterEach(() => {
  for (const workspace of workspaces.splice(0)) rmSync(workspace, { recursive: true, force: true });
});

/** 直连 host 的传输层：协议消息原样经过校验与分发，被替掉的只有 IPC 那根管子。 */
const directTransport = (handle: (payload: unknown) => Promise<unknown>): DesktopHostTransport => ({
  request: handle,
  subscribe: () => () => undefined
});

/** 新建一个工作区，测试结束时删除。 */
const newWorkspace = (): string => {
  const root = mkdtempSync(join(tmpdir(), 'rxdb-backup-scope-'));
  workspaces.push(root);
  return root;
};

/** 在 `root` 上起数据库 host 与文件 host，建一个装了本插件的实例（尚未连接）。 */
const openDesktopApp = (root: string): DesktopApp => {
  const sqliteHost = createElectronSqliteHost({
    resolveDatabasePath: databaseName => join(root, databaseName),
    postChange: () => undefined,
    onDeliveryError: error => {
      throw error;
    }
  });
  const fileHost = createElectronFileHost({ resolveStorageRoot: () => join(root, FILES_DIRECTORY) });
  const rxdb = new RxDB({
    dbName: DB_NAME,
    context: { userId: 'backup-scope-user' },
    entities: [],
    sync: { local: { adapter: ELECTRON_ADAPTER_NAME }, type: SyncType.None }
  })
    .use(rxDBPluginStorage, {
      rootDir: 'files',
      filesystem: createDesktopStorageFilesystem({ transport: directTransport(payload => fileHost.handle(payload)) })
    })
    .adapter(
      ELECTRON_ADAPTER_NAME,
      async db =>
        new RxDBAdapterElectron(db, {
          transport: directTransport(payload => sqliteHost.handle(payload)),
          batchTimeout: 1
        })
    );
  rxdb.init();
  return {
    root,
    rxdb,
    adapter: async () => (await rxdb.getAdapter(ELECTRON_ADAPTER_NAME)) as unknown as RxDBAdapterSqliteBase,
    close: async () => {
      await rxdb.disconnectAll();
      sqliteHost.closeAll();
      fileHost.closeAll();
    }
  };
};

/** 连接后取文件服务。 */
const connectedStorage = async (app: DesktopApp) => {
  await app.rxdb.connect(ELECTRON_ADAPTER_NAME);
  const storage = app.rxdb.storage;
  if (storage === undefined) throw new Error('storage plugin did not attach');
  return storage;
};

/** 收下整份归档的输出端。 */
const collectingSink = () => {
  const chunks: Uint8Array[] = [];
  return {
    sink: new WritableStream<Uint8Array>({ write: chunk => void chunks.push(chunk.slice()) }),
    bytes: () => Buffer.concat(chunks)
  };
};

/** 解开归档：manifest 与全部条目头，读到结束标记（即摘要校验通过）为止。 */
const readArchive = async (
  archive: Uint8Array<ArrayBuffer>
): Promise<{ manifest: RxDBBackupManifest; entries: RxDBBackupEntryHeader[] }> => {
  const reader = new RxDBBackupArchiveReader(new Blob([archive]).stream().getReader());
  const manifest = await reader.readManifest();
  const entries: RxDBBackupEntryHeader[] = [];
  for (let item = await reader.next(); item.type !== 'end'; item = await reader.next()) {
    if (item.type === 'entry') entries.push(item.header);
  }
  return { manifest, entries };
};

describe('database backup scope with external files (US-217 AC#14)', () => {
  it('backs up only the database and leaves referenced external files to a separate backup', async () => {
    const source = openDesktopApp(newWorkspace());
    const sourceStorage = await connectedStorage(source);
    const meta = await sourceStorage.upload(
      new File([`${CONTENT_SENTINEL} report body`], 'report.txt', { type: 'text/plain' })
    );
    const { sink, bytes } = collectingSink();
    const result = await (await source.adapter()).backup(sink);
    await source.close();

    // 结果与归档各自声明范围：数据库在内、外置文件不在。
    expect(result.scope).toEqual(RXDB_BACKUP_SCOPE);
    expect(result.scope).toEqual({ database: 'included', externalFiles: 'excluded' });
    const archive = bytes();
    const { manifest, entries } = await readArchive(archive);
    expect(manifest.scope).toEqual(RXDB_BACKUP_SCOPE);
    // 条目只有逻辑转储：没有任何一项来自文件存储目录，文件本体的字节也不在归档里。
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) expect(entry.path).toMatch(/^sqlite\//);
    expect(archive.includes(Buffer.from(CONTENT_SENTINEL))).toBe(false);
    // 源工作区里文件本体确实存在：归档没带它，不是因为它根本没写到盘上。
    expect(existsSync(join(source.root, FILES_DIRECTORY))).toBe(true);

    // 恢复到另一个工作区：数据库状态回来了，引用的文件本体没有。
    const target = openDesktopApp(newWorkspace());
    const restored = await (await target.adapter()).restore(new Blob([archive]).stream());
    expect(restored.scope).toEqual(RXDB_BACKUP_SCOPE);
    expect(restored.manifest.scope).toEqual(RXDB_BACKUP_SCOPE);
    const targetStorage = await connectedStorage(target);
    expect((await targetStorage.getMeta(meta.id))?.opfsPath).toBe(meta.opfsPath);
    await expect(targetStorage.read(meta.id)).rejects.toThrow();
    await target.close();

    // 文件另行备份恢复（这里是按文档把源工作区的文件目录拷过去）之后，同一条元数据才读得到内容。
    cpSync(join(source.root, FILES_DIRECTORY), join(target.root, FILES_DIRECTORY), { recursive: true });
    const reopened = openDesktopApp(target.root);
    const reopenedStorage = await connectedStorage(reopened);
    expect(await (await reopenedStorage.read(meta.id)).text()).toBe(`${CONTENT_SENTINEL} report body`);
    await reopened.close();
  });
});
