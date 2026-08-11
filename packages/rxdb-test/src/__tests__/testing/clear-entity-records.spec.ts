import type { EntityType, RxDB } from '@aiao/rxdb';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { clearEntityRecords } from '../../testing/clear-entity-records.js';

class EntityStub {}

const entityType = EntityStub as unknown as EntityType;

describe('clearEntityRecords', () => {
  it('removes every loaded entity through the entity manager', async () => {
    const entities = [{ id: 'left' }, { id: 'right' }];
    const findAll = vi.fn(() => of(entities));
    const removeMany = vi.fn(async () => undefined);
    const db = {
      entityManager: {
        getRepository: vi.fn(() => ({ findAll })),
        removeMany
      }
    } as unknown as RxDB;

    await clearEntityRecords(db, entityType);

    expect(findAll).toHaveBeenCalledWith({ where: { combinator: 'and', rules: [] } });
    expect(removeMany).toHaveBeenCalledWith(entities);
  });

  it('does not issue a remove operation for an empty repository', async () => {
    const removeMany = vi.fn(async () => undefined);
    const db = {
      entityManager: {
        getRepository: () => ({ findAll: () => of([]) }),
        removeMany
      }
    } as unknown as RxDB;

    await clearEntityRecords(db, entityType);

    expect(removeMany).not.toHaveBeenCalled();
  });
});
