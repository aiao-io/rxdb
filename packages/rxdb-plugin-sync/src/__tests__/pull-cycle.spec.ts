/**
 * @fileoverview 外键成环时的拉取：续拉补齐环内引用、判出补不齐的环（US-038 AC#13、#17）
 *
 * @remarks
 * 与 shop 的 `User.idCard` ↔ `IdCard.owner` 同形：`PullCycleUser.cardId` 可空、`PullCycleCard.ownerId` 非空。
 * 远端与本地都是替身：`fetchAfter` 按剧本交出续拉的一页，`existingIds` 回答本地已有哪些行。
 * 真实 PGlite 上的端到端在 `rxdb-adapter-pglite` 的 `fk-cycle-push.spec.ts`，真栈在 `rxdb-adapter-supabase` 的 `fk-cycle-sync.spec.ts`。
 */
import {
  Entity,
  EntityBase,
  getEntityMetadata,
  RelationKind,
  type RemoteChange,
  type RepositoryIdentifier,
  repositoryKey
} from '@aiao/rxdb';
import { describe, expect, it, vi } from 'vitest';
import { buildDependencyGraph } from '../dependency-graph.js';
import { closeCycleReferences, type CycleClosureSource, unsupportedPullCycles } from '../pull-cycle.js';

@Entity({
  name: 'PullCycleUser',
  namespace: 'pullcycle',
  relations: [
    {
      name: 'card',
      kind: RelationKind.ONE_TO_ONE,
      mappedEntity: 'PullCycleCard',
      mappedProperty: 'owner',
      nullable: true
    }
  ]
})
class PullCycleUser extends EntityBase {}

@Entity({
  name: 'PullCycleCard',
  namespace: 'pullcycle',
  relations: [{ name: 'owner', kind: RelationKind.ONE_TO_ONE, mappedEntity: 'PullCycleUser', mappedProperty: 'card' }]
})
class PullCycleCard extends EntityBase {}

/** 不在环上的实体 */
@Entity({ name: 'PullCycleNote', namespace: 'pullcycle' })
class PullCycleNote extends EntityBase {}

const USER: RepositoryIdentifier = { namespace: 'pullcycle', entity: 'PullCycleUser' };
const CARD: RepositoryIdentifier = { namespace: 'pullcycle', entity: 'PullCycleCard' };
const NOTE: RepositoryIdentifier = { namespace: 'pullcycle', entity: 'PullCycleNote' };

const cycleGraph = () =>
  buildDependencyGraph([PullCycleCard, PullCycleUser, PullCycleNote].map(entity => getEntityMetadata(entity)));

const AT = new Date('2026-01-01T00:00:00Z');

const insert = (id: number, repository: RepositoryIdentifier, row: Record<string, unknown>): RemoteChange => ({
  id,
  namespace: repository.namespace,
  entity: repository.entity,
  entityId: String(row['id']),
  branchId: 'main',
  type: 'INSERT',
  patch: row,
  inversePatch: null,
  clientId: 'remote',
  createdAt: AT,
  updatedAt: AT
});

const user = (id: number, userId: string, cardId: string | null) => insert(id, USER, { id: userId, cardId });
const card = (id: number, cardId: string, ownerId: string) => insert(id, CARD, { id: cardId, ownerId });

/**
 * 远端与本地的替身
 *
 * @param pages - 每个仓库续拉时依次交出的页（仓库键 → 页）；交完就是远端拉空了
 * @param local - 本地已有的行（仓库键 → 行 id）
 */
const sourceOf = (pages: Record<string, RemoteChange[][]> = {}, local: Record<string, string[]> = {}) => {
  const fetchAfter = vi.fn<CycleClosureSource['fetchAfter']>(
    async repository => pages[repositoryKey(repository)]?.shift() ?? []
  );
  const existingIds = vi.fn<CycleClosureSource['existingIds']>(async (repository, ids) => {
    const present = new Set(local[repositoryKey(repository)] ?? []);
    return new Set(ids.filter(id => present.has(id)));
  });
  return { fetchAfter, existingIds, source: { fetchAfter, existingIds } satisfies CycleClosureSource };
};

const idsOf = (changes: readonly RemoteChange[]) => changes.map(change => change.id);

describe('closeCycleReferences（US-038）', () => {
  it('依赖图里没有环：原样交回，不读本地也不续拉', async () => {
    const graph = buildDependencyGraph([getEntityMetadata(PullCycleNote)]);
    const changes = [insert(1, NOTE, { id: 'n1' })];
    const { source, fetchAfter, existingIds } = sourceOf();

    const closed = await closeCycleReferences(graph, changes, new Map(), source);

    expect(closed).toEqual(changes);
    expect(closed).not.toBe(changes);
    expect(fetchAfter).not.toHaveBeenCalled();
    expect(existingIds).not.toHaveBeenCalled();
  });

  it('AC#13：一页在环中间截断（用户引用的证件不在本页、本地也没有）：从证件仓库的水位线续拉，并进这一轮、按 id 排好', async () => {
    const { source, fetchAfter } = sourceOf({ [repositoryKey(CARD)]: [[card(6, 'c1', 'u1')]] });

    const closed = await closeCycleReferences(
      cycleGraph(),
      [user(5, 'u1', 'c1')],
      new Map([[repositoryKey(CARD), 3]]),
      source
    );

    expect(idsOf(closed)).toEqual([5, 6]);
    expect(fetchAfter).toHaveBeenCalledOnce();
    expect(fetchAfter).toHaveBeenCalledWith(CARD, 3);
  });

  it('引用的行本地已有、或外键为空：不续拉', async () => {
    const { source, fetchAfter, existingIds } = sourceOf({}, { [repositoryKey(CARD)]: ['c1'] });
    const changes = [user(5, 'u1', 'c1'), user(6, 'u2', null)];

    const closed = await closeCycleReferences(cycleGraph(), changes, new Map(), source);

    expect(closed).toEqual(changes);
    expect(existingIds).toHaveBeenCalledWith(CARD, ['c1']);
    expect(fetchAfter).not.toHaveBeenCalled();
  });

  it('这一轮已经有被引用仓库的变更：从其中最大的 id 往后续拉，不从起点水位线重拉', async () => {
    const { source, fetchAfter } = sourceOf({ [repositoryKey(CARD)]: [[card(8, 'c1', 'u1')]] });

    const closed = await closeCycleReferences(
      cycleGraph(),
      [card(4, 'c0', 'u1'), user(5, 'u1', 'c1')],
      new Map([[repositoryKey(CARD), 1]]),
      source
    );

    expect(idsOf(closed)).toEqual([4, 5, 8]);
    expect(fetchAfter).toHaveBeenCalledWith(CARD, 4);
  });

  it('续拉到的行又引用了别的缺失行：接着从那个仓库续拉，直到都找得到', async () => {
    const { source, fetchAfter } = sourceOf({
      [repositoryKey(CARD)]: [[card(6, 'c1', 'u2')]],
      [repositoryKey(USER)]: [[user(9, 'u2', null)]]
    });

    const closed = await closeCycleReferences(cycleGraph(), [user(5, 'u1', 'c1')], new Map(), source);

    expect(idsOf(closed)).toEqual([5, 6, 9]);
    expect(fetchAfter.mock.calls).toEqual([
      [CARD, 0],
      [USER, 5]
    ]);
  });

  it('远端拉空了还缺：原样交回这一轮，让提交如实撞外键，不无限续拉', async () => {
    const { source, fetchAfter } = sourceOf({ [repositoryKey(CARD)]: [[card(7, 'c9', 'u9')]] });
    const changes = [user(5, 'u1', 'c1')];

    const closed = await closeCycleReferences(cycleGraph(), changes, new Map(), source);

    // 第一次续拉到的是不相干的证件（它引用的用户也缺），第二次远端已经拉空
    expect(idsOf(closed)).toEqual([5, 7]);
    expect(fetchAfter).toHaveBeenCalledTimes(3);
  });

  it('续拉交回这一轮已有的变更：去重，不重复并进来', async () => {
    const existing = card(6, 'c2', 'u1');
    const { source } = sourceOf({ [repositoryKey(CARD)]: [[existing, card(8, 'c1', 'u1')]] });

    const closed = await closeCycleReferences(cycleGraph(), [user(5, 'u1', 'c1'), existing], new Map(), source);

    expect(idsOf(closed)).toEqual([5, 6, 8]);
  });
});

describe('unsupportedPullCycles（US-038 AC#17）', () => {
  it('环上有不支持的成员：交出这个环与那个成员；没有的环与不在环上的仓库不算', () => {
    const graph = cycleGraph();

    expect(unsupportedPullCycles(graph, repository => repositoryKey(repository) === repositoryKey(CARD))).toEqual([
      { cycle: graph.get(repositoryKey(USER))?.cycle, member: CARD }
    ]);
    expect(unsupportedPullCycles(graph, repository => repositoryKey(repository) === repositoryKey(NOTE))).toEqual([]);
    expect(unsupportedPullCycles(graph, () => false)).toEqual([]);
  });
});
