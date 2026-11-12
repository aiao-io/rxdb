import { describe, expect, it } from 'vitest';
import { openDatabase, resetStoredState } from './database.js';
import { createFile, writeFile } from './files.js';
import { createState } from './state.js';

describe('DESKTOP-US-501/504/601 IndexedDB 原子提交', () => {
  it('事务异常回滚，保存成功跨连接仍有原始字节', async () => {
    const name = `desktop-test-${crypto.randomUUID()}`;
    const db = await openDatabase(() => true, 'windows', name);
    const file = await db.transact(state => createFile(state, { name: 'a.txt', bytes: 'QQ==' }));
    await expect(
      db.transact(state => {
        writeFile(state, file.id, 1, 'Qg==');
        throw new Error('模拟中途失败');
      })
    ).rejects.toThrow('模拟中途失败');
    expect((await db.read()).files[0].bytes).toBe('QQ==');
    db.close();
    const reopened = await openDatabase(() => true, 'windows', name);
    expect((await reopened.read()).files[0].bytes).toBe('QQ==');
    reopened.close();
    indexedDB.deleteDatabase(name);
  });
  it('旧拥有者立即拒绝后续写入，不能用旧快照覆盖', async () => {
    let owns = true;
    const name = `desktop-test-${crypto.randomUUID()}`;
    const db = await openDatabase(() => owns, 'windows', name);
    owns = false;
    await expect(db.transact(state => createFile(state, { name: 'bad.txt' }))).rejects.toThrow('OWNERSHIP');
    expect((await db.read()).files).toEqual([]);
    db.close();
    indexedDB.deleteDatabase(name);
  });
  it('事务内失去拥有权或写入无效状态时，在提交前回滚', async () => {
    let owns = true;
    const name = `desktop-test-${crypto.randomUUID()}`;
    const db = await openDatabase(() => owns, 'windows', name);
    await expect(
      db.transact(state => {
        state.profile.scale = 0;
      })
    ).rejects.toThrow('INVALID');
    expect((await db.read()).profile.scale).toBe(100);
    await expect(
      db.transact(state => {
        createFile(state, { name: 'late.txt' });
        owns = false;
      })
    ).rejects.toThrow('OWNERSHIP');
    expect((await db.read()).files).toEqual([]);
    db.close();
    indexedDB.deleteDatabase(name);
  });

  it.each([1, 2, 3, 4])('已有 v%s 数据在单次写事务中升级，重新连接仍保留文件和窗口', async version => {
    const name = `desktop-migration-${crypto.randomUUID()}`;
    const initial = await openDatabase(() => true, 'windows', name);
    initial.close();
    const legacy = { ...createState('windows'), schemaVersion: version } as Record<string, unknown>;
    if (version === 1) delete legacy['navigation'];
    const fileState = createState('windows');
    createFile(fileState, { name: '升级前.txt', bytes: 'QQ==' });
    legacy['files'] = fileState.files;
    if (version === 3)
      (legacy['installations'] as { resourceVersion: string | null }[])[0].resourceVersion = 'a'.repeat(64);
    legacy['session'] = [
      {
        appId: 'editor',
        fileId: fileState.files[0].id,
        route: '/documents/saved?line=2#L2',
        workspaceId: 'first',
        bounds: { x: 90, y: 48, width: 800, height: 520 },
        state: 'minimized',
        ...(version === 4 ? { previousState: 'right', beforeMinimized: 'maximized' } : {})
      }
    ];
    await replaceStoredState(name, legacy);
    const migrated = await openDatabase(() => true, 'windows', name);
    const state = await migrated.read();
    expect(state.schemaVersion).toBe(5);
    expect(state.installations[0].resourceVersion).toBe(version === 3 ? 'a'.repeat(64) : null);
    expect(state.navigation).toEqual({ workspaceId: 'first', activeWindows: { first: null } });
    expect(state.files[0]).toMatchObject({ name: '升级前.txt', bytes: 'QQ==' });
    expect(state.session[0]).toMatchObject({
      fileId: fileState.files[0].id,
      route: '/documents/saved?line=2#L2',
      state: 'minimized',
      id: expect.any(String),
      previousState: version === 4 ? 'right' : 'normal',
      beforeMinimized: version === 4 ? 'maximized' : 'normal'
    });
    migrated.close();
    const reopened = await openDatabase(() => true, 'windows', name);
    const persisted = await reopened.read();
    expect(persisted.schemaVersion).toBe(5);
    expect(persisted.session).toEqual(state.session);
    reopened.close();
    indexedDB.deleteDatabase(name);
  });

  it('显式恢复重置仅在拥有写入权时原子替换受损数据', async () => {
    const name = `desktop-reset-${crypto.randomUUID()}`;
    const initial = await openDatabase(() => true, 'windows', name);
    initial.close();
    await replaceStoredState(name, { schemaVersion: 99, files: ['原始数据'] });
    await expect(resetStoredState(() => false, 'windows', name)).rejects.toThrow('OWNERSHIP');
    await resetStoredState(() => true, 'windows', name);
    const recovered = await openDatabase(() => true, 'windows', name);
    expect(await recovered.read()).toEqual(createState('windows'));
    recovered.close();
    indexedDB.deleteDatabase(name);
  });

  it('恢复重置写入期间丢失所有权时回滚，保留原文件', async () => {
    const name = `desktop-reset-lost-${crypto.randomUUID()}`;
    const initial = await openDatabase(() => true, 'windows', name);
    await initial.transact(state => createFile(state, { name: '保留.txt', bytes: 'QQ==' }));
    initial.close();
    let checks = 0;
    await expect(resetStoredState(() => ++checks < 3, 'windows', name)).rejects.toThrow('OWNERSHIP');
    const unchanged = await openDatabase(() => true, 'windows', name);
    expect((await unchanged.read()).files[0]).toMatchObject({ name: '保留.txt', bytes: 'QQ==' });
    unchanged.close();
    indexedDB.deleteDatabase(name);
  });

  it.each([3, 4])('损坏 v%s 会话迁移失败时原始记录和文件字节保留', async version => {
    const name = `desktop-bad-migration-${crypto.randomUUID()}`;
    const initial = await openDatabase(() => true, 'windows', name);
    initial.close();
    const state = createState('windows');
    createFile(state, { name: '保留.txt', bytes: 'QQ==' });
    const invalid = { ...state, schemaVersion: version, session: [null] };
    await replaceStoredState(name, invalid);
    await expect(openDatabase(() => true, 'windows', name)).rejects.toThrow('INVALID');
    const raw = await new Promise<unknown>((resolve, reject) => {
      const request = indexedDB.open(name, 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const tx = database.transaction('state', 'readonly');
        const read = tx.objectStore('state').get('desktop');
        read.onsuccess = () => resolve(read.result);
        read.onerror = () => reject(read.error);
        tx.oncomplete = () => database.close();
      };
    });
    expect(raw).toEqual(invalid);
    indexedDB.deleteDatabase(name);
  });
});

function replaceStoredState(name: string, state: unknown): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const tx = database.transaction('state', 'readwrite');
      tx.objectStore('state').put(state, 'desktop');
      tx.oncomplete = () => {
        database.close();
        resolve();
      };
      tx.onabort = () => {
        database.close();
        reject(tx.error);
      };
    };
  });
}
