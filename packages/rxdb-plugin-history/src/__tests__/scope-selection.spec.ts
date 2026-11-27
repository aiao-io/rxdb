import { type HistoryItem, type HistoryScope, RxDBChange, RxDBError, type UUID } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { convertChangesToHistories } from '../history-item-builder.js';
import {
  historyTouchesScope,
  isChangeInScope,
  isHistoryWithinScope,
  repositoriesScopeOf,
  RxDBCrossScopeTransactionError,
  selectScopedHistories
} from '../scope-selection.js';
const createChange = (id: number, overrides: Partial<RxDBChange> = {}): RxDBChange =>
  ({
    id,
    namespace: 'public',
    entity: 'User',
    entityId: 'user-1' as UUID,
    branchId: 'main',
    transactionId: null,
    type: 'UPDATE',
    patch: {},
    inversePatch: null,
    remoteId: null,
    revertChangeId: null,
    redoInvalidatedAt: null,
    createdAt: new Date(1_700_000_000_000 + id * 1000),
    updatedAt: new Date(1_700_000_000_000 + id * 1000),
    ...overrides
  }) as RxDBChange;

/** 把一批变更凑成同一个事务的单个 HistoryItem */
const createTransaction = (...changes: RxDBChange[]): HistoryItem =>
  convertChangesToHistories(changes.map(change => ({ ...change, transactionId: 'tx-1' as UUID }) as RxDBChange))[0];

const DATABASE: HistoryScope = { type: 'database' };
const USER_REPO: HistoryScope = { type: 'repository', namespace: 'public', entity: 'User' };
const USER_1: HistoryScope = { type: 'entity', namespace: 'public', entity: 'User', entityId: 'user-1' };

describe('scope-selection', () => {
  describe('isChangeInScope', () => {
    it('accepts everything at database scope', () => {
      expect(isChangeInScope(createChange(1, { entity: 'Post', namespace: 'tenant' }), DATABASE)).toBe(true);
    });

    it('matches repository scope on namespace and entity together', () => {
      expect(isChangeInScope(createChange(1), USER_REPO)).toBe(true);
      expect(isChangeInScope(createChange(1, { entity: 'Post' }), USER_REPO)).toBe(false);
      expect(isChangeInScope(createChange(1, { namespace: 'tenant' }), USER_REPO)).toBe(false);
    });

    it('matches entity scope on the entity id as well', () => {
      expect(isChangeInScope(createChange(1), USER_1)).toBe(true);
      expect(isChangeInScope(createChange(1, { entityId: 'user-2' as UUID }), USER_1)).toBe(false);
    });

    it('treats entity id 0 as a real id rather than a repository scope', () => {
      const scope: HistoryScope = { type: 'entity', namespace: 'public', entity: 'User', entityId: 0 };
      expect(isChangeInScope(createChange(1, { entityId: 0 as unknown as UUID }), scope)).toBe(true);
      expect(isChangeInScope(createChange(1, { entityId: 1 as unknown as UUID }), scope)).toBe(false);
    });
  });

  describe('touches vs within', () => {
    const crossScope = createTransaction(
      createChange(2),
      createChange(1, { entity: 'Post', entityId: 'post-1' as UUID })
    );

    it('a cross-scope transaction touches the scope but is not contained by it', () => {
      expect(historyTouchesScope(crossScope, USER_REPO)).toBe(true);
      expect(isHistoryWithinScope(crossScope, USER_REPO)).toBe(false);
    });

    it('every transaction is contained by the database scope', () => {
      expect(isHistoryWithinScope(crossScope, DATABASE)).toBe(true);
    });

    it('a single-entity transaction is contained by its own entity scope', () => {
      const inScope = createTransaction(createChange(2), createChange(1));
      expect(isHistoryWithinScope(inScope, USER_1)).toBe(true);
    });
  });

  describe('selectScopedHistories', () => {
    const userOnly = convertChangesToHistories([createChange(9)])[0];
    const postOnly = convertChangesToHistories([createChange(8, { entity: 'Post', entityId: 'post-1' as UUID })])[0];
    const mixed = createTransaction(createChange(7), createChange(6, { entity: 'Post', entityId: 'post-1' as UUID }));

    it('skips histories that do not touch the scope at all', () => {
      const { selected, crossScope } = selectScopedHistories([postOnly, userOnly], USER_REPO, 1);
      expect(selected.map(history => history.changeId)).toEqual([9]);
      expect(crossScope).toEqual([]);
    });

    it('returns the untruncated transaction, not the scope-filtered slice', () => {
      const { selected } = selectScopedHistories([mixed], DATABASE, 1);
      expect(selected).toHaveLength(1);
      expect(selected[0].changes.map(change => change.id)).toEqual([7, 6]);
      expect(selected[0].count).toBe(2);
    });

    it('reports a cross-scope transaction instead of selecting a partial slice of it', () => {
      const { selected, crossScope } = selectScopedHistories([mixed, userOnly], USER_REPO, 1);
      expect(selected).toEqual([]);
      expect(crossScope.map(history => history.changeId)).toEqual([7]);
    });

    it('counts the step window over scope-touching histories only', () => {
      const { selected } = selectScopedHistories([postOnly, userOnly, postOnly], USER_REPO, 5);
      expect(selected.map(history => history.changeId)).toEqual([9]);
    });

    it('selects nothing for a non-positive step', () => {
      expect(selectScopedHistories([userOnly], USER_REPO, 0)).toEqual({ crossScope: [], selected: [] });
      expect(selectScopedHistories([userOnly], USER_REPO, -3)).toEqual({ crossScope: [], selected: [] });
    });

    it('never reports a cross-scope violation at database scope', () => {
      const { crossScope, selected } = selectScopedHistories([mixed, userOnly], DATABASE, 2);
      expect(crossScope).toEqual([]);
      expect(selected).toHaveLength(2);
    });
  });

  describe('RxDBCrossScopeTransactionError', () => {
    const mixed = createTransaction(createChange(7), createChange(6, { entity: 'Post', entityId: 'post-1' as UUID }));

    it('names the scope and the repositories that fall outside it', () => {
      const error = new RxDBCrossScopeTransactionError(USER_REPO, [mixed]);
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('RxDBCrossScopeTransactionError');
      expect(error.scope).toBe(USER_REPO);
      expect(error.histories).toEqual([mixed]);
      expect(error.message).toContain('public:User');
      expect(error.message).toContain('public:Post');
    });

    it('survives instanceof across the transpiled prototype chain', () => {
      const error: unknown = new RxDBCrossScopeTransactionError(USER_1, [mixed]);
      expect(error instanceof RxDBCrossScopeTransactionError).toBe(true);
    });
  });

  describe('repositories scope（US-316）', () => {
    const USER = { namespace: 'public', entity: 'User' };
    const POST = { namespace: 'public', entity: 'Post' };
    const USER_AND_POST: HistoryScope = { type: 'repositories', repositories: [USER, POST] };

    it('matches a change in any listed repository and nothing else', () => {
      expect(isChangeInScope(createChange(1), USER_AND_POST)).toBe(true);
      expect(isChangeInScope(createChange(1, { entity: 'Post' }), USER_AND_POST)).toBe(true);
      expect(isChangeInScope(createChange(1, { entity: 'Tag' }), USER_AND_POST)).toBe(false);
      expect(isChangeInScope(createChange(1, { namespace: 'tenant' }), USER_AND_POST)).toBe(false);
    });

    it('applies a transaction that spans the listed repositories as a whole', () => {
      const spanning = createTransaction(
        createChange(2),
        createChange(1, { entity: 'Post', entityId: 'post-1' as UUID })
      );

      expect(selectScopedHistories([spanning], USER_AND_POST, 1)).toEqual({ crossScope: [], selected: [spanning] });
    });

    it('still refuses a transaction that also writes outside the listed repositories, naming the outsider', () => {
      const leaking = createTransaction(createChange(2), createChange(1, { entity: 'Tag', entityId: 'tag-1' as UUID }));
      const { crossScope } = selectScopedHistories([leaking], USER_AND_POST, 1);
      const error = new RxDBCrossScopeTransactionError(USER_AND_POST, crossScope);

      expect(crossScope).toEqual([leaking]);
      expect(error.message).toContain('public:User + public:Post');
      expect(error.message).toContain('also changes public:Tag');
    });
  });

  describe('repositoriesScopeOf（US-316）', () => {
    const ORDER_ITEM = { namespace: 'public', entity: 'OrderItem' };
    const CATEGORY = { namespace: 'public', entity: 'Category' };
    const TAG = { namespace: 'public', entity: 'Tag' };
    const CATEGORY_ORDER_ITEM = { namespace: 'public', entity: 'Category_OrderItem' };
    const ORDER_ITEM_TAG = { namespace: 'public', entity: 'OrderItem_Tag' };
    const junctions = [
      { junction: CATEGORY_ORDER_ITEM, endpoints: [CATEGORY, ORDER_ITEM] },
      { junction: ORDER_ITEM_TAG, endpoints: [ORDER_ITEM, TAG] }
    ] as const;

    it('lists the given repositories and adds the junctions whose both ends are listed', () => {
      expect(repositoriesScopeOf([ORDER_ITEM, CATEGORY], junctions)).toEqual({
        type: 'repositories',
        repositories: [ORDER_ITEM, CATEGORY, CATEGORY_ORDER_ITEM]
      });
    });

    it('leaves out a junction with only one end listed', () => {
      expect(repositoriesScopeOf([ORDER_ITEM], junctions)).toEqual({
        type: 'repositories',
        repositories: [ORDER_ITEM]
      });
    });

    it('rejects an empty list instead of widening to the database scope', () => {
      expect(() => repositoriesScopeOf([], junctions)).toThrow(RxDBError);
    });
  });
});
