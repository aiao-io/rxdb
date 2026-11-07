import { describe, expect, it } from 'vitest';
import { openDatabase } from './database.js';
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

  it('已有 v1 数据在单次写事务中升级，重新连接仍保留文件和窗口', async () => {
    const name = `desktop-migration-${crypto.randomUUID()}`;
    const initial = await openDatabase(() => true, 'windows', name);
    initial.close();
    const legacy = { ...createState('windows'), schemaVersion: 1 } as Record<string, unknown>;
    delete legacy['navigation'];
    const fileState = createState('windows');
    createFile(fileState, { name: '升级前.txt', bytes: 'QQ==' });
    legacy['files'] = fileState.files;
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(name, 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const tx = request.result.transaction('state', 'readwrite');
        tx.objectStore('state').put(legacy, 'desktop');
        tx.oncomplete = () => {
          request.result.close();
          resolve();
        };
        tx.onabort = () => {
          request.result.close();
          reject(tx.error);
        };
      };
    });
    const migrated = await openDatabase(() => true, 'windows', name);
    const state = await migrated.read();
    expect(state.schemaVersion).toBe(3);
    expect(state.navigation).toEqual({ workspaceId: 'first', activeWindows: { first: null } });
    expect(state.files[0]).toMatchObject({ name: '升级前.txt', bytes: 'QQ==' });
    migrated.close();
    const reopened = await openDatabase(() => true, 'windows', name);
    expect((await reopened.read()).schemaVersion).toBe(3);
    reopened.close();
    indexedDB.deleteDatabase(name);
  });
});
