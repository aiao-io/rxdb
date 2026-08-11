import {
  PropertyType,
  QueryTask,
  RxDB,
  RxDBEntityLocalCreatedEventData,
  RxDBEntityLocalRemovedEventData,
  RxDBEntityLocalUpdatedEventData
} from '@aiao/rxdb';
import { describe, expect, it, vi } from 'vitest';
import { GraphEntity } from '../@GraphEntity.js';
import { GraphEntityBase } from '../GraphEntityBase.js';
import { merge_create } from '../query/merge_create.js';
import { merge_remove } from '../query/merge_remove.js';
import { merge_update } from '../query/merge_update.js';

const ENTITY_NAME = 'GraphMergeUnitNode';
const NODE_ID = '00000000-0000-4000-8000-000000000010' as const;
const OTHER_ID = '00000000-0000-4000-8000-000000000011' as const;

@GraphEntity({
  name: ENTITY_NAME,
  properties: [{ type: PropertyType.string, name: 'label' }]
})
class GraphMergeUnitNode extends GraphEntityBase {
  label!: string;
}

const node = Object.assign(Object.create(GraphMergeUnitNode.prototype) as GraphMergeUnitNode, {
  id: NODE_ID,
  label: 'node'
});
const recordAt = new Date('2026-07-10T00:00:00.000Z');
const createEvent: RxDBEntityLocalCreatedEventData<typeof GraphMergeUnitNode> = {
  type: 'INSERT',
  namespace: 'public',
  entity: ENTITY_NAME,
  entityType: GraphMergeUnitNode,
  id: NODE_ID,
  patch: node,
  inversePatch: null,
  recordAt
};
const updateEvent: RxDBEntityLocalUpdatedEventData<typeof GraphMergeUnitNode> = {
  type: 'UPDATE',
  namespace: 'public',
  entity: ENTITY_NAME,
  entityType: GraphMergeUnitNode,
  id: NODE_ID,
  patch: { label: 'after' },
  inversePatch: { label: 'before' },
  recordAt
};
const removeEvent: RxDBEntityLocalRemovedEventData<typeof GraphMergeUnitNode> = {
  type: 'DELETE',
  namespace: 'public',
  entity: ENTITY_NAME,
  entityType: GraphMergeUnitNode,
  id: NODE_ID,
  patch: null,
  inversePatch: node,
  recordAt
};

type QueryType = QueryTask<typeof GraphMergeUnitNode>['type'];

const createTask = (type: QueryType, whereId?: typeof OTHER_ID) => {
  const refresh = vi.fn();
  const options =
    whereId ?
      {
        entityId: NODE_ID,
        where: {
          combinator: 'and',
          rules: [{ field: 'id', operator: '=', value: whereId }]
        }
      }
    : { entityId: NODE_ID };
  const rxdb = {
    schemaManager: {
      getEntityMetadata: vi.fn(() => undefined)
    }
  } as unknown as RxDB;
  // RXD-017 之后 queryNeedRefreshUpdate 内部靠 task.serialize 把 UPDATE 事件的增量 patch
  // 重建成完整实体（UpdateDataCache），这里必须提供，否则 merge_update 走到该分支就会
  // TypeError: task.serialize is not a function ——不是伪造数据，是补齐 QueryTask 契约。
  const serialize = vi.fn((event: RxDBEntityLocalUpdatedEventData<typeof GraphMergeUnitNode>) =>
    Object.assign(Object.create(GraphMergeUnitNode.prototype) as GraphMergeUnitNode, node, event.patch)
  );
  const task = {
    type,
    options,
    entityType: GraphMergeUnitNode,
    rxdb,
    resultEntityIds: new Set(),
    resultEntitySet: new Set(),
    refresh,
    serialize
  } as unknown as QueryTask<typeof GraphMergeUnitNode>;

  return { task, refresh };
};

describe('graph query merge hooks', () => {
  it('create 对图查询保守刷新，普通查询不刷新', () => {
    const ignored = createTask('find');
    const affected = createTask('findNeighbors');
    const unaffected = createTask('findNeighbors', OTHER_ID);

    merge_create(ignored.task, [createEvent]);
    merge_create(affected.task, [createEvent]);
    merge_create(unaffected.task, [createEvent]);

    expect(ignored.refresh).not.toHaveBeenCalled();
    expect(affected.refresh).toHaveBeenCalledOnce();
    expect(unaffected.refresh).toHaveBeenCalledOnce();
  });

  it('update 只刷新受更新事件影响的图查询', () => {
    const ignored = createTask('count');
    const affected = createTask('countNeighbors');
    const unaffected = createTask('countNeighbors', OTHER_ID);

    merge_update(ignored.task, [updateEvent]);
    merge_update(affected.task, [updateEvent]);
    merge_update(unaffected.task, [updateEvent]);

    expect(ignored.refresh).not.toHaveBeenCalled();
    expect(affected.refresh).toHaveBeenCalledOnce();
    expect(unaffected.refresh).not.toHaveBeenCalled();
  });

  // 三处 REFRESH_RULES 都声明用 match_relation_where 覆盖「边表变更」，但上游实现根本不会
  // 让它为真（buildRemoveRules 把它硬编码成 false；GraphWhere 按设计不支持关系字段，
  // whereUsesRelations 恒 false）。于是边事件只能靠 match_where 兜：查询没有 where 时侥幸刷新，
  // 一旦带 where，就会拿边实体的 sourceId/targetId 去匹配节点级 where → 恒 false → 不刷新。
  // 现象是 removeEdge 之后带 where 的实时订阅继续显示已删除的邻居。
  describe('边表事件驱动刷新', () => {
    const edgeEntity = `${ENTITY_NAME}_edges`;
    const edgeBase = {
      namespace: 'public',
      entity: edgeEntity,
      id: '00000000-0000-4000-8000-0000000000ee' as typeof NODE_ID,
      recordAt
    };
    const edgeCreate = {
      ...edgeBase,
      type: 'INSERT',
      patch: { sourceId: NODE_ID, targetId: OTHER_ID },
      inversePatch: null
    } as unknown as RxDBEntityLocalCreatedEventData<typeof GraphMergeUnitNode>;
    const edgeUpdate = {
      ...edgeBase,
      type: 'UPDATE',
      patch: { weight: 2 },
      inversePatch: { weight: 1 }
    } as unknown as RxDBEntityLocalUpdatedEventData<typeof GraphMergeUnitNode>;
    const edgeRemove = {
      ...edgeBase,
      type: 'DELETE',
      patch: null,
      inversePatch: { sourceId: NODE_ID, targetId: OTHER_ID }
    } as unknown as RxDBEntityLocalRemovedEventData<typeof GraphMergeUnitNode>;

    it('带 where 的图查询在边新增时必须刷新', () => {
      const scoped = createTask('findNeighbors', OTHER_ID);
      merge_create(scoped.task, [edgeCreate]);
      expect(scoped.refresh).toHaveBeenCalledOnce();
    });

    it('带 where 的图查询在边更新时必须刷新', () => {
      const scoped = createTask('countNeighbors', OTHER_ID);
      merge_update(scoped.task, [edgeUpdate]);
      expect(scoped.refresh).toHaveBeenCalledOnce();
    });

    it('带 where 的图查询在边删除时必须刷新', () => {
      const scoped = createTask('findPaths', OTHER_ID);
      merge_remove(scoped.task, [edgeRemove]);
      expect(scoped.refresh).toHaveBeenCalledOnce();
    });

    it('非图查询即使收到边事件也不刷新', () => {
      const plain = createTask('find');
      merge_create(plain.task, [edgeCreate]);
      merge_update(plain.task, [edgeUpdate]);
      merge_remove(plain.task, [edgeRemove]);
      expect(plain.refresh).not.toHaveBeenCalled();
    });

    it('其他实体的同名后缀表不会误触发刷新', () => {
      const scoped = createTask('findNeighbors', OTHER_ID);
      const foreignEdge = {
        ...edgeCreate,
        entity: 'SomeOtherNode_edges'
      } as unknown as RxDBEntityLocalCreatedEventData<typeof GraphMergeUnitNode>;
      merge_create(scoped.task, [foreignEdge]);
      expect(scoped.refresh).not.toHaveBeenCalled();
    });
  });

  it('remove 只刷新受删除事件影响的图查询', () => {
    const ignored = createTask('findAll');
    const affected = createTask('findPaths');
    const unaffected = createTask('findPaths', OTHER_ID);

    merge_remove(ignored.task, [removeEvent]);
    merge_remove(affected.task, [removeEvent]);
    merge_remove(unaffected.task, [removeEvent]);

    expect(ignored.refresh).not.toHaveBeenCalled();
    expect(affected.refresh).toHaveBeenCalledOnce();
    expect(unaffected.refresh).not.toHaveBeenCalled();
  });
});
