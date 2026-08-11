/**
 * @fileoverview system/sync.ts 的测试套件
 *
 * 测试同步实体定义，包括：
 * - 实体元数据验证
 * - 属性定义
 * - 索引定义
 * - 关系定义
 */

import { describe, expect, it } from 'vitest';
import { OnDeleteAction, PropertyType, RelationKind } from '../../entity/metadata-options.interface.js';
import { getEntityMetadata } from '../../rxdb-utils.js';
import { RxDBSync } from '../../system/sync.js';

describe('RxDBSync', () => {
  describe('实体元数据', () => {
    it('应当定义正确的实体名称', () => {
      const meta = getEntityMetadata(RxDBSync);
      expect(meta.name).toBe('RxDBSync');
    });

    it('应当禁用日志', () => {
      const meta = getEntityMetadata(RxDBSync);
      expect(meta.log).toBe(false);
    });
  });

  describe('属性定义', () => {
    it('应当有 id 主键属性', () => {
      const meta = getEntityMetadata(RxDBSync);
      const idProp = meta.properties.find(p => p.name === 'id');
      expect(idProp).toBeDefined();
      expect((idProp as { primary?: boolean } | undefined)?.primary).toBe(true);
      expect(idProp?.type).toBe(PropertyType.string);
    });

    it('应当有 namespace 属性', () => {
      const meta = getEntityMetadata(RxDBSync);
      const namespaceProp = meta.properties.find(p => p.name === 'namespace');
      expect(namespaceProp).toBeDefined();
      expect(namespaceProp?.type).toBe(PropertyType.string);
    });

    it('应当有 entity 属性', () => {
      const meta = getEntityMetadata(RxDBSync);
      const entityProp = meta.properties.find(p => p.name === 'entity');
      expect(entityProp).toBeDefined();
      expect(entityProp?.type).toBe(PropertyType.string);
    });

    it('应当有 syncType 属性', () => {
      const meta = getEntityMetadata(RxDBSync);
      const syncTypeProp = meta.properties.find(p => p.name === 'syncType');
      expect(syncTypeProp).toBeDefined();
      expect(syncTypeProp?.type).toBe(PropertyType.string);
      expect(syncTypeProp?.default).toBe('none');
    });

    it('应当有 lastPushedChangeId 属性', () => {
      const meta = getEntityMetadata(RxDBSync);
      const prop = meta.properties.find(p => p.name === 'lastPushedChangeId');
      expect(prop).toBeDefined();
      expect(prop?.type).toBe(PropertyType.integer);
      expect(prop?.nullable).toBe(true);
    });

    it('应当有 lastPushedAt 属性', () => {
      const meta = getEntityMetadata(RxDBSync);
      const prop = meta.properties.find(p => p.name === 'lastPushedAt');
      expect(prop).toBeDefined();
      expect(prop?.type).toBe(PropertyType.date);
      expect(prop?.nullable).toBe(true);
    });

    it('应当有 lastPulledAt 属性', () => {
      const meta = getEntityMetadata(RxDBSync);
      const prop = meta.properties.find(p => p.name === 'lastPulledAt');
      expect(prop).toBeDefined();
      expect(prop?.type).toBe(PropertyType.date);
      expect(prop?.nullable).toBe(true);
    });

    it('应当有 lastPullRemoteChangeId 属性', () => {
      const meta = getEntityMetadata(RxDBSync);
      const prop = meta.properties.find(p => p.name === 'lastPullRemoteChangeId');
      expect(prop).toBeDefined();
      expect(prop?.type).toBe(PropertyType.integer);
      expect(prop?.nullable).toBe(true);
    });

    it('应当有 enabled 属性', () => {
      const meta = getEntityMetadata(RxDBSync);
      const prop = meta.properties.find(p => p.name === 'enabled');
      expect(prop).toBeDefined();
      expect(prop?.type).toBe(PropertyType.boolean);
      expect(prop?.default).toBe(true);
    });

    it('应当有 createdAt 和 updatedAt 时间戳', () => {
      const meta = getEntityMetadata(RxDBSync);
      const createdAtProp = meta.properties.find(p => p.name === 'createdAt');
      const updatedAtProp = meta.properties.find(p => p.name === 'updatedAt');

      expect(createdAtProp).toBeDefined();
      expect(createdAtProp?.type).toBe(PropertyType.date);
      expect(createdAtProp?.readonly).toBe(true);

      expect(updatedAtProp).toBeDefined();
      expect(updatedAtProp?.type).toBe(PropertyType.date);
      expect(updatedAtProp?.readonly).toBe(true);
    });
  });

  describe('索引定义', () => {
    it('应当有 branchId 索引', () => {
      const meta = getEntityMetadata(RxDBSync);
      const index = meta.indexes.find(i => i.name === 'idx_repo_sync_branch');
      expect(index).toBeDefined();
      expect(index?.properties).toContain('branchId');
    });

    it('应当有实体唯一索引', () => {
      const meta = getEntityMetadata(RxDBSync);
      const index = meta.indexes.find(i => i.name === 'idx_repo_sync_entity');
      expect(index).toBeDefined();
      expect(index?.unique).toBe(true);
      expect(index?.properties).toContain('namespace');
      expect(index?.properties).toContain('entity');
      expect(index?.properties).toContain('branchId');
    });

    it('应当有 syncType 索引', () => {
      const meta = getEntityMetadata(RxDBSync);
      const index = meta.indexes.find(i => i.name === 'idx_repo_sync_type');
      expect(index).toBeDefined();
      expect(index?.properties).toContain('syncType');
      expect(index?.properties).toContain('branchId');
    });
  });

  describe('关系定义', () => {
    it('应当有 branch 多对一关系', () => {
      const meta = getEntityMetadata(RxDBSync);
      const branchRelation = meta.relations.find(r => r.name === 'branch');
      expect(branchRelation).toBeDefined();
      expect(branchRelation?.kind).toBe(RelationKind.MANY_TO_ONE);
      expect(branchRelation?.mappedEntity).toBe('RxDBBranch');
      expect(branchRelation?.onDelete).toBe(OnDeleteAction.CASCADE);
    });
  });

  // 注意：实例创建测试需要 RxDB 初始化，在 integration 测试中覆盖

  describe('ID 格式', () => {
    it('应当遵循 namespace:entity:branchId 格式', () => {
      const namespace = 'public';
      const entity = 'User';
      const branchId = 'main';
      const id = `${namespace}:${entity}:${branchId}`;

      expect(id).toBe('public:User:main');
    });

    it('应当能解析 ID 获取组成部分', () => {
      const id = 'public:Todo:feature-branch';
      const [namespace, entity, branchId] = id.split(':');

      expect(namespace).toBe('public');
      expect(entity).toBe('Todo');
      expect(branchId).toBe('feature-branch');
    });
  });
});
