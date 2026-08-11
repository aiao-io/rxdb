/**
 * @fileoverview system/branch.ts 的测试套件
 *
 * 测试分支实体定义，包括：
 * - 实体元数据验证
 * - 属性定义
 * - 关系定义
 */

import { describe, expect, it } from 'vitest';
import { PropertyType, RelationKind } from '../../entity/metadata-options.interface.js';
import { getEntityMetadata } from '../../rxdb-utils.js';
import { RxDBBranch } from '../../system/branch.js';

describe('RxDBBranch', () => {
  describe('实体元数据', () => {
    it('应当定义正确的实体名称', () => {
      const meta = getEntityMetadata(RxDBBranch);
      expect(meta.name).toBe('RxDBBranch');
    });

    it('应当禁用日志', () => {
      const meta = getEntityMetadata(RxDBBranch);
      expect(meta.log).toBe(false);
    });

    it('应当是树形实体', () => {
      const meta = getEntityMetadata(RxDBBranch);
      // 树形实体应该有 parent 关系
      const parentRelation = meta.relations.find(r => r.name === 'parent');
      expect(parentRelation).toBeDefined();
    });
  });

  describe('属性定义', () => {
    it('应当有 id 主键属性', () => {
      const meta = getEntityMetadata(RxDBBranch);
      const idProp = meta.properties.find(p => p.name === 'id');
      expect(idProp).toBeDefined();
      expect((idProp as { primary?: boolean } | undefined)?.primary).toBe(true);
      expect(idProp?.type).toBe(PropertyType.string);
    });

    it('应当有 activated 属性', () => {
      const meta = getEntityMetadata(RxDBBranch);
      const activatedProp = meta.properties.find(p => p.name === 'activated');
      expect(activatedProp).toBeDefined();
      expect(activatedProp?.type).toBe(PropertyType.boolean);
      expect(activatedProp?.default).toBe(false);
    });

    it('应当有 fromChangeId 属性', () => {
      const meta = getEntityMetadata(RxDBBranch);
      const fromChangeIdProp = meta.properties.find(p => p.name === 'fromChangeId');
      expect(fromChangeIdProp).toBeDefined();
      expect(fromChangeIdProp?.type).toBe(PropertyType.number);
      expect(fromChangeIdProp?.nullable).toBe(true);
    });

    it('应当有 local 属性', () => {
      const meta = getEntityMetadata(RxDBBranch);
      const localProp = meta.properties.find(p => p.name === 'local');
      expect(localProp).toBeDefined();
      expect(localProp?.type).toBe(PropertyType.boolean);
      expect(localProp?.default).toBe(true);
    });

    it('应当有 remote 属性', () => {
      const meta = getEntityMetadata(RxDBBranch);
      const remoteProp = meta.properties.find(p => p.name === 'remote');
      expect(remoteProp).toBeDefined();
      expect(remoteProp?.type).toBe(PropertyType.boolean);
      expect(remoteProp?.default).toBe(false);
    });

    it('应当有 createdAt 和 updatedAt 时间戳', () => {
      const meta = getEntityMetadata(RxDBBranch);
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

  describe('关系定义', () => {
    it('应当有 changes 一对多关系', () => {
      const meta = getEntityMetadata(RxDBBranch);
      const changesRelation = meta.relations.find(r => r.name === 'changes');
      expect(changesRelation).toBeDefined();
      expect(changesRelation?.kind).toBe(RelationKind.ONE_TO_MANY);
      expect(changesRelation?.mappedEntity).toBe('RxDBChange');
    });

    it('应当有 syncs 一对多关系', () => {
      const meta = getEntityMetadata(RxDBBranch);
      const syncsRelation = meta.relations.find(r => r.name === 'syncs');
      expect(syncsRelation).toBeDefined();
      expect(syncsRelation?.kind).toBe(RelationKind.ONE_TO_MANY);
      expect(syncsRelation?.mappedEntity).toBe('RxDBSync');
    });

    it('应当有 children 一对多关系（树形）', () => {
      const meta = getEntityMetadata(RxDBBranch);
      const childrenRelation = meta.relations.find(r => r.name === 'children');
      expect(childrenRelation).toBeDefined();
      expect(childrenRelation?.kind).toBe(RelationKind.ONE_TO_MANY);
      expect(childrenRelation?.mappedEntity).toBe('RxDBBranch');
    });

    it('应当有 parent 多对一关系（树形）', () => {
      const meta = getEntityMetadata(RxDBBranch);
      const parentRelation = meta.relations.find(r => r.name === 'parent');
      expect(parentRelation).toBeDefined();
      expect(parentRelation?.kind).toBe(RelationKind.MANY_TO_ONE);
      expect(parentRelation?.mappedEntity).toBe('RxDBBranch');
      expect((parentRelation as { nullable?: boolean } | undefined)?.nullable).toBe(true);
    });
  });

  // 注意：实例创建测试需要 RxDB 初始化，在 integration 测试中覆盖
});
