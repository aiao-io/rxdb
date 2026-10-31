import { ENTITY_LOCAL_UPDATE_EVENT, RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterElectron, type DesktopHostTransport } from '@aiao/rxdb-adapter-electron';
import { createElectronSqliteHost } from '@aiao/rxdb-adapter-electron/host';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { I18n, I18nSettings, i18nEntities } from './index.js';

const ALL = { combinator: 'and' as const, rules: [] };

async function openSharedDatabase(multiInstance: boolean) {
  const directory = mkdtempSync(join(tmpdir(), 'rxdb-i18n-shared-'));
  const listeners = new Set<(message: unknown) => void>();
  const host = createElectronSqliteHost({
    resolveDatabasePath: databaseName => join(directory, databaseName),
    postChange: message => {
      for (const listener of listeners) listener(message);
    }
  });
  const transport: DesktopHostTransport = {
    request: request => host.handle(request),
    subscribe: listener => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }
  };
  const dbName = `i18n-shared-${crypto.randomUUID()}`;
  const create = () => {
    const db = new RxDB({
      dbName,
      multiInstance,
      entities: i18nEntities(),
      context: { userId: 'i18n' },
      sync: { type: SyncType.None, local: { adapter: 'sqlite-electron' } }
    });
    db.adapter('sqlite-electron', rxdb => new RxDBAdapterElectron(rxdb, { databaseName: 'shared.sqlite3', transport }));
    return db;
  };
  const databases = [create(), create()];
  try {
    for (const db of databases) await db.connect('sqlite-electron');
    return {
      databases,
      async close() {
        await Promise.all(databases.map(db => db.destroy()));
        host.closeAll();
        rmSync(directory, { recursive: true, force: true });
      }
    };
  } catch (error) {
    await Promise.allSettled(databases.map(db => db.destroy()));
    host.closeAll();
    rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}

describe('同库双实例的语言偏好', () => {
  it('schema 就绪、偏好表为空时并发首次初始化只创建一行，并通过既有网关跟随', async () => {
    const shared = await openSharedDatabase(true);
    const [a, b] = shared.databases.map(rxdb => new I18n({ rxdb, deviceLocale: 'zh-Hans' }));
    try {
      expect(await shared.databases[0].localAdapterSync.getRepository(I18nSettings).find({ where: ALL })).toHaveLength(
        0
      );
      await Promise.all([a.init(), b.init()]);
      expect(await shared.databases[1].localAdapterSync.getRepository(I18nSettings).find({ where: ALL })).toHaveLength(
        1
      );
      await a.setLocale('en');
      await vi.waitFor(() => expect(b.locale).toBe('en'), { timeout: 5000 });
    } finally {
      a.destroy();
      b.destroy();
      await shared.close();
    }
  });

  it('multiInstance:false 不接收其他实例通知，重新打开运行时仍读取持久偏好', async () => {
    const shared = await openSharedDatabase(false);
    const [a, b] = shared.databases.map(rxdb => new I18n({ rxdb, deviceLocale: 'zh-Hans' }));
    const restarted = new I18n({ rxdb: shared.databases[1], deviceLocale: 'zh-Hans' });
    const received = vi.fn();
    shared.databases[1].addEventListener(ENTITY_LOCAL_UPDATE_EVENT, received);
    try {
      await Promise.all([a.init(), b.init()]);
      await a.setLocale('en');
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(received).not.toHaveBeenCalled();
      expect(b.locale).toBe('zh-Hans');
      expect(
        (await shared.databases[1].localAdapterSync.getRepository(I18nSettings).find({ where: ALL }))[0]
          .devicePreferredLocale
      ).toBe('en');
      await restarted.init();
      expect(restarted.locale).toBe('en');
    } finally {
      a.destroy();
      b.destroy();
      restarted.destroy();
      await shared.close();
    }
  });
});
