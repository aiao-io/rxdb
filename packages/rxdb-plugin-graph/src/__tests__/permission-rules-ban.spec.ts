/**
 * @fileoverview `GraphRepository` 拒绝规则形式权限的注册期护栏（US-029 AC#2）。
 *
 * @remarks
 * `GraphRepository.addEdge()` 不经门面写入口，规则判定管不到边表的写；声明了也只是假象。
 * 核心只负责把仓储声明的 `unsupportedPermissionRules` 翻成违规（核心自测用的是替身仓储），
 * 「图插件**确实**声明了这条限制」只有这里拿得到 `@GraphEntity` 与真实的 `rxDBPluginGraph`。
 */
import { PropertyType, RxDB, SyncType, type EntityType, type IRxDBAdapter } from '@aiao/rxdb';
import { describe, expect, it, vi } from 'vitest';
import { GraphEntity } from '../@GraphEntity.js';
import { GraphEntityBase } from '../GraphEntityBase.js';
import { rxDBPluginGraph } from '../plugin.js';

const createMockAdapter = (name: string): IRxDBAdapter =>
  ({
    name,
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    version: vi.fn().mockResolvedValue('1.0.0'),
    isTableExisted: vi.fn().mockResolvedValue(false),
    createTables: vi.fn().mockResolvedValue(undefined),
    transaction: vi.fn()
  }) as unknown as IRxDBAdapter;

@GraphEntity({
  name: 'ScopedPlace',
  properties: [{ name: 'tenantId', type: PropertyType.string }],
  access: { scope: { property: 'tenantId', prefix: 'tenant:' } },
  permissions: { update: { requires: 'edit' } }
})
class ScopedPlace extends GraphEntityBase {
  declare tenantId: string;
}

@GraphEntity({
  name: 'LockedPlace',
  properties: [{ name: 'title', type: PropertyType.string }],
  permissions: { delete: 'system' }
})
class LockedPlace extends GraphEntityBase {
  declare title: string;
}

const createRxDB = (entities: EntityType[]) => {
  const rxdb = new RxDB({
    dbName: `graph-permission-rules-${Math.random().toString(36).slice(2)}`,
    entities,
    sync: { type: SyncType.None, local: { adapter: 'sqlite' } }
  });
  rxdb.adapter('sqlite', () => createMockAdapter('sqlite'));
  rxdb.use(rxDBPluginGraph);
  return rxdb;
};

describe('GraphRepository 不支持规则形式的权限', () => {
  it('@GraphEntity 带规则：init() 抛错，消息点名实体、操作、仓储与理由', () => {
    const rxdb = createRxDB([ScopedPlace]);

    expect(() => rxdb.init()).toThrow(/ScopedPlace\.permissions\.update/);
    expect(() => createRxDB([ScopedPlace]).init()).toThrow(/GraphRepository[\s\S]*addEdge/);
  });

  it('US-027 的简写不受影响', () => {
    expect(() => createRxDB([LockedPlace]).init()).not.toThrow();
  });
});
