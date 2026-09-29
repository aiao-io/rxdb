/**
 * Electron PGlite adapter 的备份入口（US-217 阶段 C：AC#8、#19）。
 *
 * @remarks
 * 快照本身由 host 保证一致（见 `electron-pglite-host-backup.spec.ts`）；这里验证 renderer 侧
 * adapter 把 host 的能力如实写进归档、把 host 的拒绝归一成备份契约的错误码，并且在拒绝时
 * 不碰调用方的输出流。
 */
import { RXDB_BACKUP_FORMAT, RxDBBackupError, type RxDB } from '@aiao/rxdb';
import type { DesktopHostTransport } from '@aiao/rxdb-adapter-sqlite-core/desktop-host';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DesktopPGliteClient } from '../../pglite/desktop-pglite-client.js';
import type { ElectronPGliteOptions } from '../../pglite/pglite-adapter.interface.js';
import {
  backupErrorCode,
  collectingSink,
  createElectronBackupRxDB,
  deferred,
  makeNote,
  PGLITE_TEST_TIMEOUT,
  PLAIN_ENTITIES,
  preparePgliteTemplate,
  readNotes,
  removePgliteTemplate,
  seedNotes,
  startBackupHost,
  uniqueDbName,
  type BackupHost,
  type BackupHostOptions
} from './electron-pglite-backup-fixture.js';

const OWNER = 5;
const OTHER_OWNER = 6;

beforeAll(preparePgliteTemplate, 60_000);
afterAll(removePgliteTemplate);

let backupHost: BackupHost | undefined;
const opened: RxDB[] = [];
const clients: DesktopPGliteClient[] = [];

afterEach(async () => {
  for (const client of clients.splice(0)) await client.forceClose().catch(() => undefined);
  await Promise.all(opened.splice(0).map(rxdb => rxdb.disconnectAll()));
  await backupHost?.stop();
  backupHost = undefined;
});

const start = (options?: BackupHostOptions): BackupHost => {
  backupHost = startBackupHost(options);
  return backupHost;
};

const connectSource = async (
  host: BackupHost,
  options: Omit<ElectronPGliteOptions, 'transport'> = {},
  transport: DesktopHostTransport = host.transportFor(OWNER)
) => {
  const source = createElectronBackupRxDB(uniqueDbName('electron-pg-src'), PLAIN_ENTITIES, { transport, ...options });
  opened.push(source.rxdb);
  const adapter = await source.connect();
  await seedNotes(source.entities);
  return { source, adapter };
};

describe('RxDBAdapterElectronPGlite.backup', { timeout: PGLITE_TEST_TIMEOUT }, () => {
  it('records the host data directory and the extensions the host loads', async () => {
    const host = start({ extensions: ['vector', 'pg_trgm', 'vector'] });
    const { adapter } = await connectSource(host);
    const out = collectingSink();

    const result = await adapter.backup(out.sink);

    expect(out.closed()).toBe(true);
    expect(result.manifest.format).toBe(RXDB_BACKUP_FORMAT);
    // 存储标签描述源后端：桌面 host 上是一棵数据目录，而不是浏览器的 idb / memory。
    expect(result.manifest.adapter).toMatchObject({
      name: 'pglite-electron',
      engine: 'postgres',
      storage: 'directory',
      extensions: ['pg_trgm', 'vector']
    });
    expect(result.manifest.adapter.engineCompatibility).toMatch(/^postgres-\d+$/);
    expect(result.scope).toEqual({ database: 'included', externalFiles: 'excluded' });
    expect(host.deliveryErrors).toEqual([]);
  });

  it('refuses before touching the sink when the host has no backup support', async () => {
    const host = start({ withoutBackup: true });
    const { source, adapter } = await connectSource(host);
    const out = collectingSink();

    const error = await adapter.backup(out.sink).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(RxDBBackupError);
    expect((error as RxDBBackupError).code).toBe('unsupported_combination');
    // AC#8：不支持的组合不产生任何输出，也不替调用方 abort 一条它还打算用的流。
    expect(out.sink.locked).toBe(false);
    expect(out.aborted()).toBe(false);
    expect(out.chunkSizes).toEqual([]);
    await makeNote(source.entities, 'after-refusal').save();
    expect((await readNotes(adapter, source.entities)).map(note => note.title)).toContain('after-refusal');
  });

  it('gives up with lock_timeout when another window holds the connection past beginTimeout', async () => {
    const host = start();
    const base = host.transportFor(OWNER);
    let beforeBackupBegin = async (): Promise<void> => undefined;
    // 快照之前的元数据读取与普通语句一样排在别的事务后面；另一个窗口必须恰好在 `pg.backup.begin`
    // 之前占住连接，等锁超时才是 `beginTimeout` 管的那一段。
    const transport: DesktopHostTransport = {
      request: async payload => {
        if (payload.kind === 'pg.backup.begin') await beforeBackupBegin();
        return base.request(payload);
      },
      subscribe: listener => base.subscribe(listener)
    };
    const { source, adapter } = await connectSource(host, { beginTimeout: 200 }, transport);
    const other = new DesktopPGliteClient({
      transport: host.transportFor(OTHER_OWNER),
      dataDirectoryName: adapter.dataDirectoryName
    });
    clients.push(other);
    await other.init('other', {});
    const gate = deferred();
    let held: Promise<void> = Promise.resolve();
    beforeBackupBegin = async () => {
      const started = deferred();
      held = other.transaction(async tx => {
        await tx.query('SELECT 1');
        started.resolve();
        await gate.promise;
      });
      await started.promise;
    };
    const out = collectingSink();

    expect(await backupErrorCode(adapter.backup(out.sink))).toBe('lock_timeout');

    expect(out.aborted()).toBe(true);
    gate.resolve();
    await held;
    // AC#19：失败之后 host 上不留本次快照，源库照常读写。
    expect(host.host.openBackupCount).toBe(0);
    await makeNote(source.entities, 'after-timeout').save();
    expect((await readNotes(adapter, source.entities)).map(note => note.title)).toContain('after-timeout');
  });

  it('reports an already aborted signal without contacting the host', async () => {
    const host = start();
    const { adapter } = await connectSource(host);
    const out = collectingSink();
    const controller = new AbortController();
    controller.abort(new Error('user cancelled'));

    expect(await backupErrorCode(adapter.backup(out.sink, { signal: controller.signal }))).toBe('aborted');
    expect(out.sink.locked).toBe(false);
    expect(host.host.openBackupCount).toBe(0);
  });
});
