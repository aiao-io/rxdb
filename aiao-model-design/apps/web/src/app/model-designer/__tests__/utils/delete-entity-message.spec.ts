import type { RelationEntityObservable, UUID } from '@aiao/rxdb';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { RELATION_KINDS } from '../../constants/relation';
import type { DesignEntity, DesignRelation } from '../../models/index.js';
import {
  collectAffectedRelations,
  formatDeleteEntityMessage,
  type AffectedRelationSummary
} from '../../utils/delete-entity-message';

const ENTITY_1: UUID = 'e1000000-0000-0000-0000-000000000001';
const ENTITY_2: UUID = 'e2000000-0000-0000-0000-000000000002';
const ENTITY_3: UUID = 'e3000000-0000-0000-0000-000000000003';
const ENTITY_4: UUID = 'e4000000-0000-0000-0000-000000000004';
const REL_1: UUID = 'a1000000-0000-0000-0000-000000000001';
const REL_2: UUID = 'a2000000-0000-0000-0000-000000000002';
const REL_3: UUID = 'a3000000-0000-0000-0000-000000000003';

function designEntityRef(): RelationEntityObservable<typeof DesignEntity> {
  return Object.assign(of(null), { set: vi.fn(), remove: vi.fn() });
}

/**
 * 构造完整的 {@link DesignRelation} fixture。
 * 补齐全部字段而非转型，是为了让 fixture 与实体真实结构一起漂移。
 */
function rel(partial: {
  id: UUID;
  name: string;
  designEntityId: UUID;
  mappedEntityId?: string | null;
}): DesignRelation {
  return {
    id: partial.id,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    createdBy: null,
    updatedBy: null,
    designEntity$: designEntityRef(),
    designEntityId: partial.designEntityId,
    name: partial.name,
    relationKind: RELATION_KINDS.ONE_TO_MANY,
    mappedEntityId: partial.mappedEntityId ?? null,
    mappedPropertyId: null,
    mappedNamespace: null,
    columnName: null,
    displayName: null,
    onDeleteAction: null,
    onUpdateAction: null,
    sortOrder: '',
    remove: vi.fn(),
    reset: vi.fn(),
    save: vi.fn()
  };
}

describe('collectAffectedRelations', () => {
  it('MUST collect outgoing and incoming relations without duplicates', () => {
    const all = [
      rel({ id: REL_1, name: 'posts', designEntityId: ENTITY_1, mappedEntityId: ENTITY_2 }),
      rel({ id: REL_2, name: 'author', designEntityId: ENTITY_2, mappedEntityId: ENTITY_1 }),
      rel({ id: REL_3, name: 'comments', designEntityId: ENTITY_3, mappedEntityId: ENTITY_4 })
    ];
    const findByTarget = (id: string) => all.filter(r => r.mappedEntityId === id);

    const result = collectAffectedRelations([ENTITY_1], all, findByTarget);
    expect(result).toEqual(
      expect.arrayContaining([
        { id: REL_1, name: 'posts' },
        { id: REL_2, name: 'author' }
      ])
    );
    expect(result).toHaveLength(2);
  });

  it('MUST return empty for empty entity ids', () => {
    expect(collectAffectedRelations([], [rel({ id: REL_1, name: 'x', designEntityId: ENTITY_1 })], () => [])).toEqual(
      []
    );
  });
});

describe('formatDeleteEntityMessage', () => {
  const labels = {
    baseMessage: 'Delete {count} entities?',
    affectedPrefix: 'Affected: {list}',
    overflowSuffix: ' +{count} more',
    maxList: 2
  };

  it('MUST only return base message when no relations', () => {
    expect(formatDeleteEntityMessage(1, [], labels)).toBe('Delete 1 entities?');
  });

  it('MUST append relation names and overflow', () => {
    const relations: AffectedRelationSummary[] = [
      { id: '1', name: 'a' },
      { id: '2', name: 'b' },
      { id: '3', name: 'c' }
    ];
    expect(formatDeleteEntityMessage(2, relations, labels)).toBe('Delete 2 entities?\nAffected: a, b +1 more');
  });
});
