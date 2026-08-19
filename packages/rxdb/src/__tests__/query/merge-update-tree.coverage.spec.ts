import { EMPTY } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { SyncType } from '../../entity/metadata-options.interface.js';
import {
  handleCountAncestorsUpdate,
  handleCountDescendantsUpdate,
  handleFindAncestorsUpdate,
  handleFindDescendantsUpdate
} from '../../query/merge-update-tree.js';
import { UpdateDataCache, type UpdateClassification } from '../../query/merge-update.utils.js';
import type { RuleGroup } from '../../repository/query.interface.js';
import type { QueryOptions } from '../../repository/QueryManager.interface.js';
import { QueryTask } from '../../repository/QueryTask.js';
import type { FindTreeOptions } from '../../repository/tree-repository.interface.js';
import type { RxDBEntityLocalUpdatedEventData } from '../../rxdb-events.js';
import { RxDB } from '../../RxDB.js';

class TreeNode {
  id?: string;
  parentId?: string | null;
  label?: string;
  active?: boolean;
  category?: string;
}

type NodeType = typeof TreeNode;
type UpdateEvent = RxDBEntityLocalUpdatedEventData<NodeType>;
type Snapshot = readonly [id: string, entity: TreeNode | undefined];

type ClassificationInput = Partial<{
  updatedIds: readonly string[];
  matchNowIds: readonly string[];
  matchBeforeIds: readonly string[];
  newlyMatchedIds: readonly string[];
  newlyUnmatchedIds: readonly string[];
  stillMatchedIds: readonly string[];
}>;

const createNode = (
  id?: string,
  parentId: string | null = null,
  values: Readonly<Partial<TreeNode>> = {}
): TreeNode => {
  const entity = new TreeNode();
  if (id !== undefined) {
    entity.id = id;
  }
  entity.parentId = parentId;
  Object.assign(entity, values);
  return entity;
};

const createUpdate = (
  id: string,
  patch: Readonly<Partial<TreeNode>>,
  inversePatch: Readonly<Partial<TreeNode>> = {}
): UpdateEvent => ({
  type: 'UPDATE',
  namespace: 'coverage',
  entity: 'TreeNode',
  id,
  entityType: TreeNode,
  recordAt: new Date('2026-07-10T00:00:00.000Z'),
  patch,
  inversePatch
});

const createCache = (updates: UpdateEvent[], snapshots: readonly Snapshot[] = []): UpdateDataCache<NodeType> => {
  const snapshotsById = new Map<string, TreeNode | undefined>(snapshots);
  return new UpdateDataCache(updates, event => {
    if (snapshotsById.has(event.id)) {
      return snapshotsById.get(event.id) as TreeNode;
    }
    return createNode(event.id, event.patch.parentId ?? null, event.patch);
  });
};

const createClassification = (input: ClassificationInput = {}): UpdateClassification => ({
  updatedIds: new Set(input.updatedIds ?? []),
  matchNowIds: new Set(input.matchNowIds ?? []),
  matchBeforeIds: new Set(input.matchBeforeIds ?? []),
  newlyMatchedIds: new Set(input.newlyMatchedIds ?? []),
  newlyUnmatchedIds: new Set(input.newlyUnmatchedIds ?? []),
  stillMatchedIds: new Set(input.stillMatchedIds ?? [])
});

const rxdb = new RxDB({
  dbName: 'merge-update-tree-coverage',
  entities: [],
  sync: { type: SyncType.None, local: { adapter: 'coverage' } }
});

const isTreeNodeArray = (value: unknown): value is TreeNode[] => {
  if (!Array.isArray(value)) return false;
  return value.every((entity: unknown) => entity instanceof TreeNode);
};

const isNumber = (value: unknown): value is number => typeof value === 'number';

const createTask = <TResult>(
  query: QueryOptions<NodeType>,
  result: TResult,
  isResult: (value: unknown) => value is TResult
) => {
  const task = new QueryTask<NodeType>({
    cacheKey: query.type,
    options: query,
    runner: () => EMPTY,
    entityType: TreeNode,
    rxdb,
    depEntityTypeMap: new Map(),
    serialize: event => createNode(event.id),
    onClean: () => undefined,
    getFingerprint: value => [JSON.stringify(value) ?? 'undefined']
  });
  task.next(result);
  const next = vi.fn<(value: TResult, force?: boolean) => void>();
  const refresh = vi.fn<() => void>();
  vi.spyOn(task, 'next').mockImplementation((value, force) => {
    if (!isResult(value)) throw new TypeError(`Unexpected ${query.type} result`);
    if (force === undefined) {
      next(value);
      return;
    }
    next(value, force);
  });
  vi.spyOn(task, 'refresh').mockImplementation(refresh);
  return { task, next, refresh };
};

const createFindDescendantsTask = (options: FindTreeOptions<NodeType>, result: TreeNode[]) =>
  createTask({ type: 'findDescendants', options }, result, isTreeNodeArray);

const createFindAncestorsTask = (options: FindTreeOptions<NodeType>, result: TreeNode[]) =>
  createTask({ type: 'findAncestors', options }, result, isTreeNodeArray);

const createCountDescendantsTask = (options: FindTreeOptions<NodeType>, result: number) =>
  createTask({ type: 'countDescendants', options }, result, isNumber);

const createCountAncestorsTask = (options: FindTreeOptions<NodeType>, result: number) =>
  createTask({ type: 'countAncestors', options }, result, isNumber);

const idsOf = (entities: readonly TreeNode[]): Array<string | undefined> => entities.map(entity => entity.id);

const activeWhere: RuleGroup<TreeNode> = { combinator: 'and', rules: [] };
const matchesActive = (entity: TreeNode | null | undefined): boolean => entity?.active === true;

describe('merge-update-tree direct coverage', () => {
  describe('handleFindDescendantsUpdate', () => {
    it('keeps untouched and id-less results without notifying', () => {
      const idless = createNode(undefined, 'root');
      const untouched = createNode('untouched', 'root');
      const { task, next } = createFindDescendantsTask({ entityId: 'root' }, [idless, untouched]);

      handleFindDescendantsUpdate(task, [], createClassification(), createCache([]));

      expect(next).not.toHaveBeenCalled();
    });

    it('ignores a stale classification id that is absent from the update batch', () => {
      const stale = createNode('stale', 'root', { label: 'before' });
      const { task, next } = createFindDescendantsTask({ entityId: 'root' }, [stale]);

      handleFindDescendantsUpdate(task, [], createClassification({ updatedIds: ['stale'] }), createCache([]));

      expect(next).not.toHaveBeenCalled();
      expect(stale.label).toBe('before');
    });

    it('removes a moved result using patch.parentId when updated serialization is unavailable', () => {
      // 无序列化时不能保守保留：patch.parentId 已经证明节点离开了目标子树
      const child = createNode('child', 'root');
      const updates = [createUpdate('child', { parentId: 'outside', label: 'after' }, { parentId: 'root' })];
      const { task, next } = createFindDescendantsTask({ entityId: 'root' }, [child]);

      handleFindDescendantsUpdate(
        task,
        updates,
        createClassification({ updatedIds: ['child'], matchNowIds: ['child'] }),
        createCache(updates, [['child', undefined]])
      );

      expect(next).toHaveBeenCalledTimes(1);
      expect(idsOf(next.mock.calls[0][0])).toEqual([]);
    });

    it('judges level by the serialized parentId when the event patch is stale', () => {
      // 迟到事件：patch 还停留在「grand 挂到 root」那一版，序列化结果已是最新的 child。
      // 序列化侧带 P0-004 单调性守卫，层级必须按它判定，把 grand 从 level=1 结果里摘掉。
      const root = createNode('root', null);
      const child = createNode('child', 'root');
      const grand = createNode('grand', 'child');
      const updates = [createUpdate('grand', { id: 'grand', parentId: 'root' }, { parentId: 'child' })];
      const { task, next } = createFindDescendantsTask({ entityId: 'root', level: 1 }, [root, child, grand]);

      handleFindDescendantsUpdate(
        task,
        updates,
        createClassification({ updatedIds: ['grand'], matchNowIds: ['grand'] }),
        createCache(updates, [['grand', createNode('grand', 'child')]])
      );

      expect(next).toHaveBeenCalledTimes(1);
      expect(idsOf(next.mock.calls[0][0])).toEqual(['root', 'child']);
    });

    it('removes newly unmatched entities and patches retained descendants', () => {
      const removed = createNode('removed', 'root', { active: true });
      const retained = createNode('retained', 'root', { label: 'before' });
      const updates = [
        createUpdate('removed', { id: 'removed', active: false }, { active: true }),
        createUpdate('retained', { id: 'retained', label: 'after' }, { label: 'before' })
      ];
      const { task, next } = createFindDescendantsTask({ entityId: 'root' }, [removed, retained]);

      handleFindDescendantsUpdate(
        task,
        updates,
        createClassification({
          updatedIds: ['removed', 'retained'],
          matchNowIds: ['retained'],
          matchBeforeIds: ['removed', 'retained'],
          newlyUnmatchedIds: ['removed'],
          stillMatchedIds: ['retained']
        }),
        createCache(updates, [['retained', createNode('retained', 'root', { label: 'after' })]])
      );

      expect(next).toHaveBeenCalledTimes(1);
      expect(idsOf(next.mock.calls[0][0])).toEqual(['retained']);
      expect(next.mock.calls[0][0][0]).toMatchObject({ label: 'after', parentId: 'root' });
      expect(next.mock.calls[0][1]).toBe(true);
    });

    it('removes a moved branch while conservatively retaining unresolved and cyclic nodes', () => {
      const moved = createNode('moved', 'root');
      const direct = createNode('direct', 'moved');
      const grandchild = createNode('grandchild', 'direct');
      const cachedBridgeChild = createNode('cached-bridge-child', 'bridge');
      const survivor = createNode('survivor', 'root');
      const unresolved = createNode('unresolved', 'missing');
      const cycleA = createNode('cycle-a', 'cycle-b');
      const cycleB = createNode('cycle-b', 'cycle-a');
      const idless = createNode(undefined, 'moved');
      const updates = [
        createUpdate('moved', { id: 'moved', parentId: 'outside' }, { parentId: 'root' }),
        createUpdate('bridge', { id: 'bridge', parentId: 'moved' })
      ];
      const { task, next } = createFindDescendantsTask({ entityId: 'root' }, [
        moved,
        direct,
        grandchild,
        cachedBridgeChild,
        survivor,
        unresolved,
        cycleA,
        cycleB,
        idless
      ]);

      handleFindDescendantsUpdate(
        task,
        updates,
        createClassification({ updatedIds: ['moved', 'bridge'], matchNowIds: ['moved'] }),
        createCache(updates, [
          ['moved', createNode('moved', 'outside')],
          ['bridge', createNode('bridge', 'moved')]
        ])
      );

      expect(next).toHaveBeenCalledTimes(1);
      expect(idsOf(next.mock.calls[0][0])).toEqual(['survivor', 'unresolved', 'cycle-a', 'cycle-b', undefined]);
    });

    it('removes descendants that move beyond the requested level', () => {
      const parent = createNode('parent', 'root');
      const child = createNode('child', 'root');
      const updates = [createUpdate('child', { id: 'child', parentId: 'parent' }, { parentId: 'root' })];
      const { task, next } = createFindDescendantsTask({ entityId: 'root', level: 1 }, [parent, child]);

      handleFindDescendantsUpdate(
        task,
        updates,
        createClassification({ updatedIds: ['child'], matchNowIds: ['child'] }),
        createCache(updates, [['child', createNode('child', 'parent')]])
      );

      expect(idsOf(next.mock.calls[0][0])).toEqual(['parent']);
    });

    it('retains and patches a moved descendant that remains within the level', () => {
      const parent = createNode('parent', 'root');
      const child = createNode('child', 'root', { label: 'before' });
      const updates = [
        createUpdate(
          'child',
          { id: 'child', parentId: 'parent', label: 'after' },
          { parentId: 'root', label: 'before' }
        )
      ];
      const { task, next } = createFindDescendantsTask({ entityId: 'root', level: 2 }, [parent, child]);

      handleFindDescendantsUpdate(
        task,
        updates,
        createClassification({ updatedIds: ['child'], matchNowIds: ['child'], stillMatchedIds: ['child'] }),
        createCache(updates, [['child', createNode('child', 'parent', { label: 'after' })]])
      );

      expect(idsOf(next.mock.calls[0][0])).toEqual(['parent', 'child']);
      expect(next.mock.calls[0][0][1]).toMatchObject({ parentId: 'parent', label: 'after' });
    });

    it('RXD-022: refreshes instead of locally patching when a matching entity moves into scope', () => {
      // 'added' 的 parentId 真正从 'outside' 变为 'root'——跨 scope 进入。它此前
      // 可能已有子孙，且这些子孙不会出现在本批事件里，局部 patch 只能加入 'added'
      // 自己，无法证明它没有隐藏子树，因此必须整体刷新（RXD-022 设计）。
      const existing = createNode('existing', 'root');
      const updates = [createUpdate('added', { id: 'added', parentId: 'root' }, { parentId: 'outside' })];
      const { task, next, refresh } = createFindDescendantsTask({ entityId: 'root' }, [existing]);

      handleFindDescendantsUpdate(
        task,
        updates,
        createClassification({
          updatedIds: ['added'],
          matchNowIds: ['added'],
          newlyMatchedIds: ['added']
        }),
        createCache(updates, [['added', createNode('added', 'root')]])
      );

      expect(refresh).toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    });

    it('adds a newly matching descendant without requiring a parent patch', () => {
      const existing = createNode('existing', 'root');
      const updates = [createUpdate('matched', { id: 'matched', active: true }, { active: false })];
      const { task, next } = createFindDescendantsTask({ entityId: 'root' }, [existing]);

      handleFindDescendantsUpdate(
        task,
        updates,
        createClassification({
          updatedIds: ['matched'],
          matchNowIds: ['matched'],
          newlyMatchedIds: ['matched']
        }),
        createCache(updates, [['matched', createNode('matched', 'root', { active: true })]])
      );

      expect(idsOf(next.mock.calls[0][0])).toEqual(['existing', 'matched']);
    });

    it('does not duplicate a newly matching entity already retained in the result', () => {
      const matched = createNode('matched', 'root', { active: false });
      const updates = [createUpdate('matched', { id: 'matched', active: true }, { active: false })];
      const { task, next } = createFindDescendantsTask({ entityId: 'root' }, [matched]);

      handleFindDescendantsUpdate(
        task,
        updates,
        createClassification({
          updatedIds: ['matched'],
          matchNowIds: ['matched'],
          newlyMatchedIds: ['matched']
        }),
        createCache(updates, [['matched', createNode('matched', 'root', { active: true })]])
      );

      expect(idsOf(next.mock.calls[0][0])).toEqual(['matched']);
      expect(next.mock.calls[0][0][0].active).toBe(true);
    });

    it('ignores non-descendants and descendants beyond the level when considering additions', () => {
      const updates = [
        createUpdate('outside', { id: 'outside', parentId: 'missing' }),
        createUpdate('deep', { id: 'deep', parentId: 'parent' }),
        createUpdate('parent', { id: 'parent', parentId: 'root' })
      ];
      const { task, next } = createFindDescendantsTask({ entityId: 'root', level: 1 }, []);

      handleFindDescendantsUpdate(
        task,
        updates,
        createClassification({ updatedIds: ['outside', 'deep', 'parent'], matchNowIds: ['outside', 'deep'] }),
        createCache(updates, [
          ['outside', createNode('outside', 'missing')],
          ['deep', createNode('deep', 'parent')],
          ['parent', createNode('parent', 'root')]
        ])
      );

      expect(next).not.toHaveBeenCalled();
    });

    it('RXD-022: skips a candidate with no serialized snapshot, then refreshes on the next moved-in candidate', () => {
      // 'missing' 没有可序列化快照，按原逻辑被跳过；'anonymous' 的 parentId 从
      // undefined(inversePatch 默认 {})真变为 'root'，属于跨 scope 进入，必须
      // 整体刷新——不能靠局部把它拼进结果（同上一个用例的设计依据）。
      const updates = [
        createUpdate('missing', { id: 'missing', parentId: 'root' }),
        createUpdate('anonymous', { id: 'anonymous', parentId: 'root' })
      ];
      const { task, next, refresh } = createFindDescendantsTask({ entityId: 'root' }, []);

      handleFindDescendantsUpdate(
        task,
        updates,
        createClassification({ updatedIds: ['missing', 'anonymous'], matchNowIds: ['missing', 'anonymous'] }),
        createCache(updates, [
          ['missing', undefined],
          ['anonymous', createNode(undefined, 'root')]
        ])
      );

      expect(refresh).toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    });

    it('RXD-022: refreshes for a newly matched entity even in "all trees" mode (undefined target)', () => {
      // target 未指定即"全树"模式，isEntityDescendant 对任何实体都直接判真。但
      // 'child' 的 parentId 仍是真变化(inversePatch 默认 {} → 视为从未知/null
      // 变为 'missing')，它自己可能带着未出现在本批事件里的子孙，局部加入仍会
      // 漏项，同样必须整体刷新，而不是靠 level 计数把它局部拼进结果。
      const updates = [createUpdate('child', { id: 'child', parentId: 'missing' })];
      const { task, next, refresh } = createFindDescendantsTask({}, []);

      handleFindDescendantsUpdate(
        task,
        updates,
        createClassification({ updatedIds: ['child'], matchNowIds: ['child'] }),
        createCache(updates, [['child', createNode('child', 'missing')]])
      );

      expect(refresh).toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    });

    it('skips a newly matched entity when serialization fails', () => {
      const updates = [createUpdate('missing', { id: 'missing', active: true }, { active: false })];
      const { task, next } = createFindDescendantsTask({ entityId: 'root' }, []);

      handleFindDescendantsUpdate(
        task,
        updates,
        createClassification({ updatedIds: ['missing'], matchNowIds: ['missing'], newlyMatchedIds: ['missing'] }),
        createCache(updates, [['missing', undefined]])
      );

      expect(next).not.toHaveBeenCalled();
    });

    it('does not add newly matched entities outside the tree or level', () => {
      const updates = [
        createUpdate('outside', { id: 'outside', active: true }, { active: false }),
        createUpdate('deep', { id: 'deep', active: true }, { active: false }),
        createUpdate('parent', { id: 'parent', parentId: 'root' })
      ];
      const { task, next } = createFindDescendantsTask({ entityId: 'root', level: 1 }, []);

      handleFindDescendantsUpdate(
        task,
        updates,
        createClassification({
          updatedIds: ['outside', 'deep', 'parent'],
          matchNowIds: ['outside', 'deep'],
          newlyMatchedIds: ['outside', 'deep']
        }),
        createCache(updates, [
          ['outside', createNode('outside', 'missing', { active: true })],
          ['deep', createNode('deep', 'parent', { active: true })],
          ['parent', createNode('parent', 'root')]
        ])
      );

      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('handleFindAncestorsUpdate', () => {
    it('returns without notifying when the target cannot be resolved', () => {
      const { task, next } = createFindAncestorsTask({}, []);

      handleFindAncestorsUpdate(task, [], createClassification(), createCache([]));

      expect(next).not.toHaveBeenCalled();
    });

    it('uses the old target snapshot and keeps id-less results without changes', () => {
      const idless = createNode(undefined, null);
      const ancestor = createNode('ancestor', null);
      const target = createNode('target', 'ancestor');
      const { task, next } = createFindAncestorsTask({ entityId: 'target' }, [idless, ancestor, target]);

      handleFindAncestorsUpdate(task, [], createClassification(), createCache([]));

      expect(next).not.toHaveBeenCalled();
    });

    it('ignores a stale ancestor classification id that has no event data', () => {
      const ancestor = createNode('ancestor', null, { label: 'before' });
      const target = createNode('target', 'ancestor');
      const { task, next } = createFindAncestorsTask({ entityId: 'target' }, [ancestor, target]);

      handleFindAncestorsUpdate(
        task,
        [],
        createClassification({ updatedIds: ['ancestor'], matchNowIds: ['ancestor'] }),
        createCache([])
      );

      expect(next).not.toHaveBeenCalled();
      expect(ancestor.label).toBe('before');
    });

    it('removes an unmatched ancestor and patches a retained target', () => {
      const ancestor = createNode('ancestor', null, { active: true });
      const target = createNode('target', 'ancestor', { label: 'before' });
      const updates = [
        createUpdate('ancestor', { id: 'ancestor', active: false }, { active: true }),
        createUpdate('target', { id: 'target', label: 'after' }, { label: 'before' })
      ];
      const { task, next } = createFindAncestorsTask({ entityId: 'target' }, [ancestor, target]);

      handleFindAncestorsUpdate(
        task,
        updates,
        createClassification({
          updatedIds: ['ancestor', 'target'],
          matchNowIds: ['target'],
          newlyUnmatchedIds: ['ancestor']
        }),
        createCache(updates, [['target', createNode('target', 'ancestor', { label: 'after' })]])
      );

      expect(idsOf(next.mock.calls[0][0])).toEqual(['target']);
      expect(next.mock.calls[0][0][0].label).toBe('after');
    });

    it('RXD-022: refreshes instead of locally rechecking every old result when the target moves', () => {
      // target 自身的 parentId 真正从 'old' 变为 'new'——旧链路上方(old)要摘除，
      // 新链路上方(new/top)要补入，但 new/top 从未出现在本批事件里，局部无法
      // 拼出新链路，只能整体刷新(替代了此前只会做旧链路摘除判断的
      // needRecheckAll 分支)。
      const oldAncestor = createNode('old', null);
      const newParent = createNode('new', 'top');
      const top = createNode('top', null);
      const target = createNode('target', 'old');
      const idless = createNode(undefined, null);
      const updates = [createUpdate('target', { id: 'target', parentId: 'new' }, { parentId: 'old' })];
      const { task, next, refresh } = createFindAncestorsTask({ entityId: 'target' }, [
        oldAncestor,
        newParent,
        top,
        target,
        idless
      ]);

      handleFindAncestorsUpdate(
        task,
        updates,
        createClassification({ updatedIds: ['target'], matchNowIds: ['target'] }),
        createCache(updates, [['target', createNode('target', 'new')]])
      );

      expect(refresh).toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    });

    it('RXD-022: refreshes when an already-tracked candidate moves, even if the target snapshot is unavailable', () => {
      // candidate 已经在旧结果集(oldResultMap)里被追踪，且它自己的 parentId 真正
      // 从 null 变为 'elsewhere'——即使 target 本身这一批不可解析，这个已追踪祖先
      // 换父仍然意味着它之上的链路可能整体变化，局部保留+patch 无法证明正确性，
      // 必须整体刷新。
      const candidate = createNode('candidate', null, { label: 'before' });
      const updates = [
        createUpdate('candidate', { id: 'candidate', parentId: 'elsewhere', label: 'after' }, { parentId: null })
      ];
      const { task, next, refresh } = createFindAncestorsTask({ entityId: 'missing-target' }, [candidate]);

      handleFindAncestorsUpdate(
        task,
        updates,
        createClassification({ updatedIds: ['candidate'], matchNowIds: ['candidate'] }),
        createCache(updates, [['candidate', createNode('candidate', 'elsewhere', { label: 'after' })]])
      );

      expect(refresh).toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    });

    it('RXD-022: applies a renamed identifier in place when the candidate parentId is unchanged', () => {
      // RxDB 的 UPDATE 事件按不可变主键寻址，patch.id 与实体自身 id 不一致这种
      // 场景在真实场景中不会发生；这里 parentId 前后都是 null(未变)，不落入
      // RXD-022 新增的"祖先换父→刷新"分支。此前的"情况3"整链重验逻辑已随重构
      // 整体移除(其判定本身依赖已被判定为 bug 的 key-presence 检查)，现在的行为
      // 是: 按第二步统一走字段级 patch 合并，保留实体、原地更新其(此处恰好包含
      // id 的)字段。
      const ancestor = createNode('ancestor', null);
      const target = createNode('target', 'ancestor');
      const updates = [createUpdate('ancestor', { id: 'renamed', parentId: null }, { id: 'ancestor' })];
      const { task, next } = createFindAncestorsTask({ entityId: 'target' }, [ancestor, target]);

      handleFindAncestorsUpdate(
        task,
        updates,
        createClassification({ updatedIds: ['ancestor'], matchNowIds: ['ancestor'] }),
        createCache(updates, [['ancestor', createNode('renamed', null)]])
      );

      expect(idsOf(next.mock.calls[0][0])).toEqual(['renamed', 'target']);
    });

    it('retains and patches a candidate when its updated serialization is unavailable', () => {
      const ancestor = createNode('ancestor', null, { label: 'before' });
      const target = createNode('target', 'ancestor');
      const updates = [createUpdate('ancestor', { parentId: null, label: 'after' }, { label: 'before' })];
      const { task, next } = createFindAncestorsTask({ entityId: 'target' }, [ancestor, target]);

      handleFindAncestorsUpdate(
        task,
        updates,
        createClassification({ updatedIds: ['ancestor'], matchNowIds: ['ancestor'] }),
        createCache(updates, [['ancestor', undefined]])
      );

      expect(idsOf(next.mock.calls[0][0])).toEqual(['ancestor', 'target']);
      expect(next.mock.calls[0][0][0].label).toBe('after');
    });

    it('RXD-022: refreshes when the target itself is updated with a genuinely changed parentId', () => {
      // 本批事件里 target 自己也被更新，patch.parentId='parent' 而 inversePatch
      // 默认 {}(即视为此前未知/null)——按真值比较这本身就是一次真实的 parentId
      // 变化，命中 targetParentIdChanged，必须整体刷新，不再走"只添加新匹配祖先、
      // 补回 target 自身"的局部逻辑。
      const retainedAncestor = createNode('top', null);
      const updates = [
        createUpdate('target', { id: 'target', parentId: 'parent' }),
        createUpdate('parent', { id: 'parent', parentId: 'top' }),
        createUpdate('top', { id: 'top', parentId: null }),
        createUpdate('outside', { id: 'outside', parentId: null }),
        createUpdate('missing', { id: 'missing', parentId: null })
      ];
      const { task, next, refresh } = createFindAncestorsTask({ entityId: 'target' }, [retainedAncestor]);

      handleFindAncestorsUpdate(
        task,
        updates,
        createClassification({
          updatedIds: ['target', 'parent', 'top', 'outside', 'missing'],
          matchNowIds: ['parent', 'outside', 'missing'],
          newlyMatchedIds: ['parent', 'outside', 'missing']
        }),
        createCache(updates, [
          ['target', createNode('target', 'parent')],
          ['parent', createNode('parent', 'top')],
          ['top', createNode('top', null)],
          ['outside', createNode('outside', null)],
          ['missing', undefined]
        ])
      );

      expect(refresh).toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    });

    it('does not restore a target serialization without an identifier', () => {
      const updates = [createUpdate('target', { parentId: null })];
      const { task, next } = createFindAncestorsTask({ entityId: 'target' }, []);

      handleFindAncestorsUpdate(
        task,
        updates,
        createClassification({ updatedIds: ['target'] }),
        createCache(updates, [['target', createNode(undefined, null)]])
      );

      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('handleCountDescendantsUpdate', () => {
    it('RXD-022: refreshes instead of a naive +1 when an entity moves into the target subtree', () => {
      // child 的 parentId 真正从 null 变为 'root'，是否为 root 后代的判定
      // (isEntityDescendantForCount)在 before/after 都能第一跳直接判定，不经过
      // 未命中分支——专门隔离本次修复新增的 hasParentIdChanged 分支。child 若带着
      // 未出现在本批事件里的既有子孙一起进入 scope，天真 +1 只会漏算，必须整体
      // 刷新(对应 review 描述的"count 只加减 1"缺陷)。
      const updates = [createUpdate('child', { id: 'child', parentId: 'root' }, { parentId: null })];
      const { task, next, refresh } = createCountDescendantsTask({ entityId: 'root' }, 2);

      handleCountDescendantsUpdate(
        task,
        updates,
        createClassification(),
        createCache(updates, [['child', createNode('child', 'root')]]),
        null,
        matchesActive
      );

      expect(refresh).toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    });

    it('RXD-022: refreshes instead of a naive -1 when an entity leaves the subtree', () => {
      // child 的 parentId 真正从 'root' 变为 null，带走的可能是它自己的整棵子树，
      // 天真 -1 同样会漏算，必须整体刷新，而非局部按 ±1 计数。
      const updates = [createUpdate('child', { id: 'child', parentId: null }, { parentId: 'root' })];
      const { task, next, refresh } = createCountDescendantsTask({ entityId: 'root' }, 0);

      handleCountDescendantsUpdate(
        task,
        updates,
        createClassification(),
        createCache(updates, [['child', createNode('child', null)]]),
        undefined,
        matchesActive
      );

      expect(refresh).toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    });

    it('uses complete before and after entities for where transitions', () => {
      const updates = [
        createUpdate('child', { id: 'child', parentId: 'root', active: true, category: 'stable' }, { active: false })
      ];
      const matches = vi.fn<(entity: TreeNode | null | undefined, where: RuleGroup<TreeNode>) => boolean>(
        entity => entity?.active === true && entity.category === 'stable'
      );
      const { task, next } = createCountDescendantsTask({ entityId: 'root' }, 4);

      handleCountDescendantsUpdate(
        task,
        updates,
        createClassification(),
        createCache(updates, [['child', createNode('child', 'root', { active: true, category: 'stable' })]]),
        activeWhere,
        matches
      );

      expect(next).toHaveBeenCalledWith(5);
      expect(matches).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ active: false, category: 'stable' }),
        activeWhere
      );
      expect(matches).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ active: true, category: 'stable' }),
        activeWhere
      );
    });

    it('does not notify when membership and matching stay unchanged', () => {
      const updates = [
        createUpdate('child', { id: 'child', parentId: 'root', active: true }, { active: true }),
        createUpdate('outside', { id: 'outside', parentId: null, active: false }, { active: false })
      ];
      const { task, next, refresh } = createCountDescendantsTask({ entityId: 'root' }, 1);

      handleCountDescendantsUpdate(
        task,
        updates,
        createClassification(),
        createCache(updates, [
          ['child', createNode('child', 'root', { active: true })],
          ['outside', createNode('outside', null, { active: false })]
        ]),
        activeWhere,
        matchesActive
      );

      expect(next).not.toHaveBeenCalled();
      expect(refresh).not.toHaveBeenCalled();
    });

    it('refreshes when the previous parent chain cannot be resolved', () => {
      const updates = [createUpdate('child', { id: 'child', parentId: 'missing' }, { parentId: 'missing' })];
      const { task, next, refresh } = createCountDescendantsTask({ entityId: 'root' }, 1);

      handleCountDescendantsUpdate(
        task,
        updates,
        createClassification(),
        createCache(updates, [['child', createNode('child', 'missing')]]),
        null,
        matchesActive
      );

      expect(refresh).toHaveBeenCalledTimes(1);
      expect(next).not.toHaveBeenCalled();
    });

    it('refreshes when only the updated parent chain is unresolved', () => {
      const updates = [createUpdate('child', { id: 'child', parentId: 'missing' }, { parentId: 'root' })];
      const { task, next, refresh } = createCountDescendantsTask({ entityId: 'root' }, 1);

      handleCountDescendantsUpdate(
        task,
        updates,
        createClassification(),
        createCache(updates, [['child', createNode('child', 'missing')]]),
        null,
        matchesActive
      );

      expect(refresh).toHaveBeenCalledTimes(1);
      expect(next).not.toHaveBeenCalled();
    });

    it('supports all-tree counts with an undefined target', () => {
      const updates = [createUpdate('root', { id: 'root', parentId: null, active: true }, { active: false })];
      const { task, next } = createCountDescendantsTask({}, 0);

      handleCountDescendantsUpdate(
        task,
        updates,
        createClassification(),
        createCache(updates, [['root', createNode('root', null, { active: true })]]),
        activeWhere,
        matchesActive
      );

      expect(next).toHaveBeenCalledWith(1);
    });
  });

  describe('handleCountAncestorsUpdate', () => {
    it('refreshes when the target identifier is absent', () => {
      const { task, next, refresh } = createCountAncestorsTask({}, 1);

      handleCountAncestorsUpdate(task, [], createClassification(), createCache([]), null, matchesActive);

      expect(refresh).toHaveBeenCalledTimes(1);
      expect(next).not.toHaveBeenCalled();
    });

    it('refreshes when the target is not part of the update batch', () => {
      const updates = [createUpdate('other', { id: 'other', parentId: null })];
      const { task, refresh } = createCountAncestorsTask({ entityId: 'target' }, 1);

      handleCountAncestorsUpdate(task, updates, createClassification(), createCache(updates), null, matchesActive);

      expect(refresh).toHaveBeenCalledTimes(1);
    });

    it('refreshes when the target serialization is unavailable', () => {
      const updates = [createUpdate('target', { id: 'target', parentId: null })];
      const { task, refresh } = createCountAncestorsTask({ entityId: 'target' }, 1);

      handleCountAncestorsUpdate(
        task,
        updates,
        createClassification(),
        createCache(updates, [['target', undefined]]),
        null,
        matchesActive
      );

      expect(refresh).toHaveBeenCalledTimes(1);
    });

    it('refreshes when the target parent changes', () => {
      const updates = [createUpdate('target', { id: 'target', parentId: 'new' }, { parentId: 'old' })];
      const { task, refresh } = createCountAncestorsTask({ entityId: 'target' }, 1);

      handleCountAncestorsUpdate(
        task,
        updates,
        createClassification(),
        createCache(updates, [['target', createNode('target', 'new')]]),
        null,
        matchesActive
      );

      expect(refresh).toHaveBeenCalledTimes(1);
    });

    it('increments when a direct ancestor starts matching where', () => {
      const updates = [
        createUpdate('target', { id: 'target', parentId: 'parent' }, { parentId: 'parent' }),
        createUpdate('parent', { id: 'parent', parentId: null, active: true }, { active: false })
      ];
      const { task, next, refresh } = createCountAncestorsTask({ entityId: 'target' }, 2);

      handleCountAncestorsUpdate(
        task,
        updates,
        createClassification(),
        createCache(updates, [
          ['target', createNode('target', 'parent')],
          ['parent', createNode('parent', null, { active: true })]
        ]),
        activeWhere,
        matchesActive
      );

      expect(next).toHaveBeenCalledWith(3);
      expect(refresh).not.toHaveBeenCalled();
    });

    it('decrements and clamps when a direct ancestor stops matching where', () => {
      const updates = [
        createUpdate('target', { id: 'target', parentId: 'parent' }, { parentId: 'parent' }),
        createUpdate('parent', { id: 'parent', parentId: null, active: false }, { active: true })
      ];
      const { task, next } = createCountAncestorsTask({ entityId: 'target' }, 0);

      handleCountAncestorsUpdate(
        task,
        updates,
        createClassification(),
        createCache(updates, [
          ['target', createNode('target', 'parent')],
          ['parent', createNode('parent', null, { active: false })]
        ]),
        activeWhere,
        matchesActive
      );

      expect(next).toHaveBeenCalledWith(0);
    });

    it('reuses relation decisions for duplicate updates and emits no unchanged count', () => {
      const targetUpdate = createUpdate('target', { id: 'target', parentId: 'parent' }, { parentId: 'parent' });
      const parentUpdate = createUpdate('parent', { id: 'parent', parentId: null, active: true }, { active: true });
      const updates = [targetUpdate, parentUpdate, parentUpdate];
      const { task, next, refresh } = createCountAncestorsTask({ entityId: 'target' }, 1);

      handleCountAncestorsUpdate(
        task,
        updates,
        createClassification(),
        createCache(updates, [
          ['target', createNode('target', 'parent')],
          ['parent', createNode('parent', null, { active: true })]
        ]),
        activeWhere,
        matchesActive
      );

      expect(next).not.toHaveBeenCalled();
      expect(refresh).not.toHaveBeenCalled();
    });

    it('does not notify for a determinable non-ancestor', () => {
      const updates = [
        createUpdate('target', { id: 'target', parentId: null }, { parentId: null }),
        createUpdate('candidate', { id: 'candidate', parentId: null }, { parentId: null })
      ];
      const { task, next, refresh } = createCountAncestorsTask({ entityId: 'target' }, 1);

      handleCountAncestorsUpdate(
        task,
        updates,
        createClassification(),
        createCache(updates, [
          ['target', createNode('target', null)],
          ['candidate', createNode('candidate', null)]
        ]),
        null,
        matchesActive
      );

      expect(next).not.toHaveBeenCalled();
      expect(refresh).not.toHaveBeenCalled();
    });

    it('refreshes when the previous ancestor chain cannot be resolved', () => {
      const updates = [
        createUpdate('target', { id: 'target', parentId: 'middle' }, { parentId: 'middle' }),
        createUpdate('candidate', { id: 'candidate', parentId: null }, { parentId: null })
      ];
      const { task, next, refresh } = createCountAncestorsTask({ entityId: 'target' }, 1);

      handleCountAncestorsUpdate(
        task,
        updates,
        createClassification(),
        createCache(updates, [
          ['target', createNode('target', 'middle')],
          ['candidate', createNode('candidate', null)]
        ]),
        null,
        matchesActive
      );

      expect(refresh).toHaveBeenCalledTimes(1);
      expect(next).not.toHaveBeenCalled();
    });

    it('refreshes when only the updated candidate serialization lacks an identifier', () => {
      const updates = [
        createUpdate('target', { id: 'target', parentId: 'candidate' }, { parentId: 'candidate' }),
        createUpdate('candidate', { parentId: null }, { id: 'candidate', parentId: null })
      ];
      const { task, next, refresh } = createCountAncestorsTask({ entityId: 'target' }, 1);

      handleCountAncestorsUpdate(
        task,
        updates,
        createClassification(),
        createCache(updates, [
          ['target', createNode('target', 'candidate')],
          ['candidate', createNode(undefined, null)]
        ]),
        null,
        matchesActive
      );

      expect(refresh).toHaveBeenCalledTimes(1);
      expect(next).not.toHaveBeenCalled();
    });
  });
});
