/**
 * @fileoverview 未装树插件时的注册期护栏（US-025 AC E2）。
 *
 * @remarks
 * 树搬出核心后，`@TreeEntity` 声明的 `repository: 'TreeRepository'` 在只装核心的
 * `RxDB` 上查不到。护栏必须在 `init()` 同步抛错、且错误消息要能把人引到解法上——
 * 只说「没找到」，调用方分不清是名字拼错了还是漏了一句 `rxdb.use(...)`。
 *
 * 这份用例住在插件包而不是核心：核心已经不认识 `TreeEntity`，写不出「声明了树实体」
 * 这个前置条件。反过来插件包两边都拿得到——它依赖核心，且能选择**不**把自己装上。
 */
import { RxDB, SyncType, type EntityType, type IRxDBAdapter } from '@aiao/rxdb';
import { describe, expect, it, vi } from 'vitest';
import { TreeEntity } from '../../entity/tree-entity.decorator.js';
import { rxDBPluginTree } from '../../plugin.js';

const createMockAdapter = (): IRxDBAdapter =>
  ({
    name: 'mock-adapter',
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    version: vi.fn().mockResolvedValue('1.0.0'),
    isTableExisted: vi.fn().mockResolvedValue(false),
    createTables: vi.fn().mockResolvedValue(undefined),
    transaction: vi.fn()
  }) as unknown as IRxDBAdapter;

@TreeEntity({ name: 'UninstalledTreeNode' })
class UninstalledTreeNode {}

const createRxDB = () => {
  const rxdb = new RxDB({
    dbName: 'tree-plugin-missing',
    entities: [UninstalledTreeNode] as unknown as EntityType[],
    sync: { local: { adapter: 'mock' }, type: SyncType.None }
  });
  rxdb.adapter('mock', createMockAdapter);
  return rxdb;
};

describe('未装 @aiao/rxdb-plugin-tree 时声明 @TreeEntity', () => {
  it('init() 抛错，且消息列出当前已注册的仓储名', () => {
    const rxdb = createRxDB();

    // 三段都要在：缺了哪个名字、现在有哪些名字、下一步该做什么。
    expect(() => rxdb.init()).toThrow("Repository 'TreeRepository' not found for entity 'UninstalledTreeNode'");
    expect(() => createRxDB().init()).toThrow(/Registered repositories: [^.]*Repository/);
    expect(() => createRxDB().init()).toThrow('请确认已调用 rxdb.use(...) 装上对应插件');
  });

  it('错误消息不点名任何插件包——核心不认识插件', () => {
    const rxdb = createRxDB();

    // 写死 `@aiao/rxdb-plugin-tree` 等于把刚拆出去的耦合焊回核心。
    expect(() => rxdb.init()).not.toThrow(/@aiao\/rxdb-plugin-tree/);
  });

  it('装上插件后同一份实体注册通过', () => {
    const rxdb = createRxDB();
    rxdb.use(rxDBPluginTree);

    expect(() => rxdb.init()).not.toThrow();
    expect(rxdb.getRepositoryNames()).toContain('TreeRepository');
  });
});
