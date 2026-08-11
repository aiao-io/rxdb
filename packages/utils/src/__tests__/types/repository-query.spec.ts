import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { getRepositoryMethod, hasRepositoryMethod } from '../../types/repository-query.js';

describe('repository-query', () => {
  class TestEntity {
    static entityName = 'TestEntity';

    static find(options: unknown) {
      return of({ entityName: this.entityName, options });
    }
  }

  it('gets a bound static repository method', () => {
    const method = getRepositoryMethod(TestEntity, 'find');

    expect(method).toBeDefined();

    method?.({ where: { id: '1' } }).subscribe(result => {
      expect(result).toEqual({
        entityName: 'TestEntity',
        options: { where: { id: '1' } }
      });
    });
  });

  it('returns undefined for non-function hosts', () => {
    expect(getRepositoryMethod({ find: () => of(null) }, 'find')).toBeUndefined();
    expect(hasRepositoryMethod({ find: () => of(null) }, 'find')).toEqual(false);
  });

  it('ignores non-function properties', () => {
    expect(getRepositoryMethod(TestEntity, 'entityName')).toBeUndefined();
    expect(hasRepositoryMethod(TestEntity, 'entityName')).toEqual(false);
  });

  it('detects static repository methods', () => {
    expect(hasRepositoryMethod(TestEntity, 'find')).toEqual(true);
  });
});
