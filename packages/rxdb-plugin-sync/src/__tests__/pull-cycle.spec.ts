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
  PropertyType,
  RelationKind,
  type RemoteChange,
  type RepositoryIdentifier,
  repositoryKey
} from '@aiao/rxdb';
import { describe, expect, it, vi } from 'vitest';
import { buildDependencyGraph } from '../dependency-graph.js';
import {
  closeCycleReferences,
  type CycleClosureSource,
  MAX_CYCLE_CLOSURE_PAGES,
  unsupportedPullCycles
} from '../pull-cycle.js';

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

/**
 * 只由复合外键成的环：没有关系，`(bId, tenantId)` → B`(id, tenantId)`、`(aId, tenantId)` → A`(id, tenantId)`。
 * 被引用的行由映射到 `id` 的那一列认出来
 */
@Entity({
  name: 'PullCompositeA',
  namespace: 'pullcomposite',
  properties: [
    { name: 'tenantId', type: PropertyType.string },
    { name: 'bId', type: PropertyType.uuid, nullable: true }
  ],
  indexes: [{ name: 'pull_composite_a_identity', properties: ['id', 'tenantId'], unique: true }],
  foreignKeys: [
    {
      name: 'pull_composite_a_b',
      properties: ['bId', 'tenantId'],
      mappedEntity: 'PullCompositeB',
      mappedProperties: ['id', 'tenantId']
    }
  ]
})
class PullCompositeA extends EntityBase {}

@Entity({
  name: 'PullCompositeB',
  namespace: 'pullcomposite',
  properties: [
    { name: 'tenantId', type: PropertyType.string },
    { name: 'aId', type: PropertyType.uuid }
  ],
  indexes: [{ name: 'pull_composite_b_identity', properties: ['id', 'tenantId'], unique: true }],
  foreignKeys: [
    {
      name: 'pull_composite_b_a',
      properties: ['aId', 'tenantId'],
      mappedEntity: 'PullCompositeA',
      mappedProperties: ['id', 'tenantId']
    }
  ]
})
class PullCompositeB extends EntityBase {}

/** 不在环上的实体 */
@Entity({ name: 'PullCycleNote', namespace: 'pullcycle' })
class PullCycleNote extends EntityBase {}

const USER: RepositoryIdentifier = { namespace: 'pullcycle', entity: 'PullCycleUser' };
const CARD: RepositoryIdentifier = { namespace: 'pullcycle', entity: 'PullCycleCard' };
const NOTE: RepositoryIdentifier = { namespace: 'pullcycle', entity: 'PullCycleNote' };
const COMPOSITE_A: RepositoryIdentifier = { namespace: 'pullcomposite', entity: 'PullCompositeA' };
const COMPOSITE_B: RepositoryIdentifier = { namespace: 'pullcomposite', entity: 'PullCompositeB' };

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

  it('补不齐（被引用的行远端一直不出现）：续拉到页数上限就停、原样交回，不把整段远端历史拉进内存', async () => {
    // 远端还有远多于上限的页，每页都是不相干的证件（引用的用户就在这一轮里）；u1 引用的 c1 永远不出现，
    // 例如它被行级安全挡住、或在别的分支上
    const pages = Array.from({ length: MAX_CYCLE_CLOSURE_PAGES + 10 }, (_, page) => [
      card(100 + page, `c-other-${page}`, 'u1')
    ]);
    const { source, fetchAfter } = sourceOf({ [repositoryKey(CARD)]: pages });

    const closed = await closeCycleReferences(cycleGraph(), [user(5, 'u1', 'c1')], new Map(), source);

    expect(fetchAfter).toHaveBeenCalledTimes(MAX_CYCLE_CLOSURE_PAGES);
    expect(closed).toHaveLength(1 + MAX_CYCLE_CLOSURE_PAGES);
    expect(fetchAfter).toHaveBeenLastCalledWith(CARD, 100 + MAX_CYCLE_CLOSURE_PAGES - 2);
  });

  it('这一轮里被引用仓库的变更极多：续拉起点照样算得出，不因展开成参数而栈溢出', async () => {
    // 展开二十万个参数在 V8 上会 RangeError（同包 pull-batch.ts 求水位线时已规避过）
    const cards = Array.from({ length: 200_000 }, (_, index) => card(index + 1, `c${index + 1}`, 'u1'));
    const { source, fetchAfter } = sourceOf();

    const closed = await closeCycleReferences(
      cycleGraph(),
      [...cards, user(300_000, 'u1', 'c-missing')],
      new Map(),
      source
    );

    expect(closed).toHaveLength(200_001);
    expect(fetchAfter).toHaveBeenCalledWith(CARD, 200_000);
  });

  it('只由复合外键成的环：按映射到 id 的那一列认出被引用的行，同样续拉补齐', async () => {
    const graph = buildDependencyGraph([PullCompositeA, PullCompositeB].map(entity => getEntityMetadata(entity)));
    const { source, fetchAfter } = sourceOf({
      [repositoryKey(COMPOSITE_B)]: [[insert(6, COMPOSITE_B, { id: 'b1', tenantId: 't', aId: 'a1' })]]
    });

    const closed = await closeCycleReferences(
      graph,
      [insert(5, COMPOSITE_A, { id: 'a1', tenantId: 't', bId: 'b1' })],
      new Map(),
      source
    );

    expect(idsOf(closed)).toEqual([5, 6]);
    expect(fetchAfter).toHaveBeenCalledExactlyOnceWith(COMPOSITE_B, 0);
  });

  it('续拉交回这一轮已有的变更：去重，不重复并进来', async () => {
    const existing = card(6, 'c2', 'u1');
    const { source } = sourceOf({ [repositoryKey(CARD)]: [[existing, card(8, 'c1', 'u1')]] });

    const closed = await closeCycleReferences(cycleGraph(), [user(5, 'u1', 'c1'), existing], new Map(), source);

    expect(idsOf(closed)).toEqual([5, 6, 8]);
  });
});

describe('unsupportedPullCycles（US-038 AC#17）', () => {
  const detailOf = (target: { namespace: string; entity: string }) => async (repository: typeof CARD) =>
    repositoryKey(repository) === repositoryKey(target) ?
      `${repositoryKey(repository)} is synced by filter`
    : undefined;

  it('环上有补不齐的成员：交出这个环、那个成员与原因；没有的环与不在环上的仓库不算', async () => {
    const graph = cycleGraph();

    expect(await unsupportedPullCycles(graph, detailOf(CARD))).toEqual([
      {
        cycle: graph.get(repositoryKey(USER))?.cycle,
        member: CARD,
        detail: `${repositoryKey(CARD)} is synced by filter`
      }
    ]);
    expect(await unsupportedPullCycles(graph, detailOf(NOTE))).toEqual([]);
    expect(await unsupportedPullCycles(graph, async () => undefined)).toEqual([]);
  });
});
