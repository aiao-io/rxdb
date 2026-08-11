import { EntityType, PropertyType, RxDB, SyncType } from '@aiao/rxdb';
import { NEVER, of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { GraphEntity } from '../@GraphEntity.js';
import { GraphEntityBase } from '../GraphEntityBase.js';
import { GraphRepository } from '../GraphRepository.js';
import { createGraphQueryResult } from '../graph-query-result.js';
import { IGraphRepository } from '../graph-repository.interface.js';

const NODE_A_ID = '00000000-0000-4000-8000-000000000001' as const;
const NODE_B_ID = '00000000-0000-4000-8000-000000000002' as const;

@GraphEntity({
  name: 'GraphRepositoryUnitNode',
  properties: [{ type: PropertyType.string, name: 'label' }],
  features: { graph: { type: 'directed-graph', weight: true } }
})
class GraphRepositoryUnitNode extends GraphEntityBase {
  label!: string;
}

class TestGraphRepository extends GraphRepository<typeof GraphRepositoryUnitNode> {
  get taskManager() {
    return this.queryManager;
  }
}

type LocalRepository = IGraphRepository<typeof GraphRepositoryUnitNode>;
type CreateEntityRef = (EntityType: EntityType, data: GraphRepositoryUnitNode) => GraphRepositoryUnitNode;

const createNode = (id: typeof NODE_A_ID | typeof NODE_B_ID, label: string): GraphRepositoryUnitNode =>
  Object.assign(Object.create(GraphRepositoryUnitNode.prototype) as GraphRepositoryUnitNode, { id, label });

const setup = () => {
  const findNeighbors = vi.fn<LocalRepository['findNeighbors']>();
  const countNeighbors = vi.fn<LocalRepository['countNeighbors']>();
  const findPaths = vi.fn<LocalRepository['findPaths']>();
  const addEdge = vi.fn<LocalRepository['addEdge']>();
  const removeEdge = vi.fn<LocalRepository['removeEdge']>();
  const localRepository: LocalRepository = {
    find: vi.fn<LocalRepository['find']>(async () => []),
    count: vi.fn<LocalRepository['count']>(async () => 0),
    create: vi.fn<LocalRepository['create']>(async entity => entity),
    update: vi.fn<LocalRepository['update']>(async (entity, patch) => Object.assign(entity, patch)),
    remove: vi.fn<LocalRepository['remove']>(async entity => entity),
    findNeighbors,
    countNeighbors,
    findPaths,
    addEdge,
    removeEdge
  };
  const getRepository = vi.fn(() => localRepository);
  const createEntityRef = vi.fn<CreateEntityRef>((_EntityType, data) =>
    Object.assign(Object.create(GraphRepositoryUnitNode.prototype) as GraphRepositoryUnitNode, data)
  );
  const rxdb = {
    localAdapter$: of({ getRepository }),
    remoteAdapter$: NEVER,
    config: {
      sync: {
        type: SyncType.None,
        local: { adapter: 'local' }
      }
    },
    entityManager: { createEntityRef },
    schemaManager: { getEntityType: vi.fn(() => undefined) },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  } as unknown as RxDB;

  return {
    repository: new TestGraphRepository(rxdb, GraphRepositoryUnitNode),
    findNeighbors,
    countNeighbors,
    findPaths,
    addEdge,
    removeEdge,
    getRepository,
    createEntityRef
  };
};

describe('GraphRepository', () => {
  it('level=0 时不访问本地仓库', async () => {
    const { repository, findNeighbors, getRepository } = setup();

    await expect(repository.findNeighbors({ entityId: NODE_A_ID, level: 0 })).resolves.toEqual([]);

    expect(findNeighbors).not.toHaveBeenCalled();
    expect(getRepository).not.toHaveBeenCalled();
  });

  it('规范化邻居参数并把原始节点转换为实体引用', async () => {
    const { repository, findNeighbors, createEntityRef } = setup();
    const rawNode = createNode(NODE_B_ID, 'B');
    findNeighbors.mockResolvedValue([
      {
        node: rawNode,
        edge: {
          sourceId: NODE_A_ID,
          targetId: NODE_B_ID,
          direction: 'out',
          weight: 3,
          properties: { kind: 'friend' }
        },
        level: 1
      }
    ]);

    const result = await repository.findNeighbors({ entityId: NODE_A_ID });

    expect(findNeighbors).toHaveBeenCalledWith({ entityId: NODE_A_ID, direction: 'both', level: 1, limit: 1000 });
    expect(createEntityRef).toHaveBeenCalledWith(GraphRepositoryUnitNode, rawNode);
    expect(result).toEqual([
      {
        node: expect.objectContaining({ id: NODE_B_ID, label: 'B' }),
        edge: {
          sourceId: NODE_A_ID,
          targetId: NODE_B_ID,
          direction: 'out',
          weight: 3,
          properties: { kind: 'friend' }
        },
        level: 1
      }
    ]);
    expect(result[0].node).not.toBe(rawNode);
  });

  it('数组内容不变但 truncated 翻转时仍发射新结果', async () => {
    const { repository, findNeighbors } = setup();
    findNeighbors
      .mockResolvedValueOnce(createGraphQueryResult([], false))
      .mockResolvedValueOnce(createGraphQueryResult([], true));
    const createTask = vi.spyOn(repository.taskManager, 'createTask');
    const truncatedStates: Array<boolean | undefined> = [];
    const subscription = repository.findNeighbors$({ entityId: NODE_A_ID }).subscribe(result => {
      truncatedStates.push(result.truncated);
    });

    await vi.waitFor(() => expect(truncatedStates).toEqual([false]));
    const task = createTask.mock.results[0]?.value;
    expect(task).toBeDefined();
    task?.refresh();

    await vi.waitFor(() => expect(truncatedStates).toEqual([false, true]));
    subscription.unsubscribe();
  });

  it('规范化邻居计数参数并委托本地仓库', async () => {
    const { repository, countNeighbors } = setup();
    countNeighbors.mockResolvedValue(2);

    await expect(repository.countNeighbors({ entityId: NODE_A_ID, level: -5 })).resolves.toBe(2);

    expect(countNeighbors).toHaveBeenCalledWith({ entityId: NODE_A_ID, direction: 'both', level: 1, limit: 1000 });
  });

  it('规范化路径参数并转换路径中的全部节点引用', async () => {
    const { repository, findPaths, createEntityRef } = setup();
    const from = createNode(NODE_A_ID, 'A');
    const to = createNode(NODE_B_ID, 'B');
    findPaths.mockResolvedValue([
      {
        nodes: [from, to],
        edges: [{ sourceId: NODE_A_ID, targetId: NODE_B_ID, weight: 3 }],
        length: 1,
        totalWeight: 3
      }
    ]);

    const result = await repository.findPaths({ fromId: NODE_A_ID, toId: NODE_B_ID, maxDepth: 999 });

    expect(findPaths).toHaveBeenCalledWith({
      fromId: NODE_A_ID,
      toId: NODE_B_ID,
      direction: 'both',
      maxDepth: 100,
      limit: 1000
    });
    expect(createEntityRef).toHaveBeenCalledTimes(2);
    expect(result[0].nodes).toEqual([
      expect.objectContaining({ id: NODE_A_ID, label: 'A' }),
      expect.objectContaining({ id: NODE_B_ID, label: 'B' })
    ]);
    expect(result[0].nodes[0]).not.toBe(from);
    expect(result[0].nodes[1]).not.toBe(to);
  });

  it('完整转发边写入与删除参数', async () => {
    const { repository, addEdge, removeEdge } = setup();
    const from = createNode(NODE_A_ID, 'A');
    const to = createNode(NODE_B_ID, 'B');
    addEdge.mockResolvedValue(undefined);
    removeEdge.mockResolvedValue(undefined);

    await repository.addEdge(from, to, 7, { kind: 'friend' });
    await repository.removeEdge(from, to);

    expect(addEdge).toHaveBeenCalledWith(from, to, 7, { kind: 'friend' });
    expect(removeEdge).toHaveBeenCalledWith(from, to);
  });
});
