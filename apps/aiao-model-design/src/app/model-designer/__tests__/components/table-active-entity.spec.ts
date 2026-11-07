import type { DesignEntity } from '../../models/index.js';
import { describe, expect, it } from 'vitest';
import { resolveActiveEntity } from '../../components/table/table-view.component';

describe('resolveActiveEntity', () => {
  const entities = [{ id: 'e1', name: 'User' }] as unknown as DesignEntity[];

  it('MUST resolve an existing route entity', () => {
    expect(resolveActiveEntity(entities, 'e1')).toBe(entities[0]);
  });

  it('MUST NOT fall back to the first entity for a missing route id', () => {
    expect(resolveActiveEntity(entities, 'missing')).toBeNull();
    expect(resolveActiveEntity(entities, null)).toBeNull();
  });
});
