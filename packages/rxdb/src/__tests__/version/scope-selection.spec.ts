import { describe, expect, it } from 'vitest';
import type { UUID } from '../../entity/entity.interface.js';
import { RxDBChange } from '../../system/change.js';
import { convertChangesToHistories } from '../../version/history-item-builder.js';
import {
  historyTouchesScope,
  isChangeInScope,
  isHistoryWithinScope,
  RxDBCrossScopeTransactionError,
  selectScopedHistories
} from '../../version/scope-selection.js';
import type { HistoryItem, HistoryScope } from '../../version/VersionManager.interface.js';

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
});
