/**
 * T072: 分支创建测试
 *
 * 测试 rxdb_adapter_create_branch 功能，确保与 SQLite 行为一致
 */

import { RxDB, SyncType } from '@aiao/rxdb';
import { ENTITIES, User } from '@aiao/rxdb-test/shop';
import { firstValueFrom } from 'rxjs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../RxDBAdapterPGlite.js';

describe('分支创建 (createBranch)', () => {
  let rxdb: RxDB;
  let adapter: RxDBAdapterPGlite;
  const dbName = `branch-test-${Date.now()}`;

  beforeAll(async () => {
    rxdb = new RxDB({
      dbName,
      context: { userId: 'test-user' },
      entities: [...ENTITIES],
      sync: {
        local: { adapter: 'pglite' },
        type: SyncType.None
      }
    });

    rxdb.adapter('pglite', async db => {
      adapter = new RxDBAdapterPGlite(db, { store: 'memory' });
      return adapter;
    });

    await rxdb.connect('pglite');
  });

  afterAll(async () => {
    if (rxdb) {
      await rxdb.disconnectAll();
    }
  });

  beforeEach(async () => {
    // 清理数据（包括 User + 系统表）
    const users = await firstValueFrom(User.find({ where: { combinator: 'and', rules: [] } }));
    for (const user of users) {
      await user.remove();
    }

    // 清理 RxDBChange 和自定义 RxDBBranch（保留 'main' 分支）
    const { changeRepository, branchRepository } = await rxdb.versionManager.getLocalRepositories();

    // 删除所有 change 记录
    const changes = await changeRepository.find({ where: { combinator: 'and', rules: [] } });
    for (const change of changes) {
      await changeRepository.remove(change);
    }

    // 删除非 main 分支
    const branches = await branchRepository.find({ where: { combinator: 'and', rules: [] } });
    for (const branch of branches) {
      if (branch.id !== 'main') {
        await branch.remove();
      }
    }
  });

  it('从有数据的主分支创建新分支', async () => {
    // 在主分支创建初始数据
    const user = new User();
    user.name = 'Test User';
    user.age = 30;
    await user.save();

    // 创建新分支
    const result = await rxdb.versionManager.createBranch('branch_01');

    expect(result).toBeDefined();
    expect(result.id).toBe('branch_01');
    expect(result.activated).toBe(false);
    expect(result.fromChangeId).toBe(1);
    expect(result.local).toBe(true);
    expect(result.remote).toBe(false);
  });

  it('从空的主分支创建新分支', async () => {
    // 在没有数据的情况下创建新分支
    const result = await rxdb.versionManager.createBranch('branch_empty');

    expect(result).toBeDefined();
    expect(result.id).toBe('branch_empty');
    expect(result.activated).toBe(false);
    expect(result.fromChangeId).toBeNull();
    expect(result.local).toBe(true);
    expect(result.remote).toBe(false);
  });

  it('不能创建已存在的分支', async () => {
    // 创建第一个分支
    await rxdb.versionManager.createBranch('branch_duplicate');

    // 尝试创建同名分支应该抛出错误
    await expect(rxdb.versionManager.createBranch('branch_duplicate')).rejects.toThrow(/already exists/i);
  });

  it('从指定变更点创建分支', async () => {
    // 创建多个变更记录
    const user1 = new User();
    user1.name = 'User 1';
    await user1.save(); // changeId = ?

    const user2 = new User();
    user2.name = 'User 2';
    await user2.save(); // changeId = ?

    // 获取实际的 changeId
    const { changeRepository } = await rxdb.versionManager.getLocalRepositories();
    const changes = await changeRepository.find({
      where: { combinator: 'and', rules: [] },
      orderBy: [{ field: 'id', sort: 'asc' }]
    });

    expect(changes.length).toBeGreaterThanOrEqual(2);
    const firstChangeId = changes[0].id;

    // 从第一个变更点创建分支
    const result = await rxdb.versionManager.createBranch('branch_from_change', firstChangeId);

    expect(result).toBeDefined();
    expect(result.id).toBe('branch_from_change');
    expect(result.fromChangeId).toBe(firstChangeId);
  });
});
