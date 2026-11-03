import type { RxDB } from '@aiao/rxdb';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { createRxDBWorkbenchCatalog, WorkbenchProject } from './rxdb-catalog.js';

describe('RxDB workbench project catalog', () => {
  it('maps repository entities to catalog entries in the supplied database', async () => {
    const record = { id: 'project', name: 'name', template: 'vue', entry: 'src/main.ts', lastOpenedAt: 3 };
    const repository = { findAll: vi.fn(() => of([record])) };
    const getRepository = vi.fn(() => repository);
    const db = { entityManager: { getRepository } } as unknown as RxDB;
    expect(await createRxDBWorkbenchCatalog(db).list()).toEqual([
      { id: 'project', name: 'name', template: 'vue', entry: 'src/main.ts', updatedAt: 3 }
    ]);
    expect(getRepository).toHaveBeenCalledWith(WorkbenchProject);
    expect(repository.findAll).toHaveBeenCalledWith({ where: { combinator: 'and', rules: [] } });
  });

  it('updates an existing entity and creates missing metadata through the entity manager', async () => {
    const record = {
      id: 'project',
      name: '',
      template: '',
      entry: '',
      lastOpenedAt: 0,
      save: vi.fn(async () => undefined)
    };
    const instantiate = vi.fn(() => record);
    const repository = { findOne: vi.fn().mockReturnValueOnce(of(record)).mockReturnValueOnce(of(undefined)) };
    const db = { entityManager: { instantiate, getRepository: () => repository } } as unknown as RxDB;
    const catalog = createRxDBWorkbenchCatalog(db);
    const info = { id: 'project', name: 'new name', template: 'react' as const, entry: 'src/main.tsx', updatedAt: 5 };
    await catalog.put(info);
    expect(record.name).toBe('new name');
    expect(record.lastOpenedAt).toBe(5);
    expect(instantiate).not.toHaveBeenCalled();
    await catalog.put({ ...info, name: 'created' });
    expect(instantiate).toHaveBeenCalledWith(WorkbenchProject, { id: 'project' });
    expect(repository.findOne).toHaveBeenCalledWith({
      where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: 'project' }] }
    });
    expect(record.save).toHaveBeenCalledTimes(2);
  });

  it('propagates repository failures without materializing replacement metadata', async () => {
    const instantiate = vi.fn();
    const repository = {
      findAll: () => throwError(() => new Error('database unavailable')),
      findOne: () => throwError(() => new Error('lookup failed'))
    };
    const db = { entityManager: { instantiate, getRepository: () => repository } } as unknown as RxDB;
    const catalog = createRxDBWorkbenchCatalog(db);
    await expect(catalog.list()).rejects.toThrow('database unavailable');
    await expect(
      catalog.put({ id: 'p', name: 'p', template: 'vanilla', entry: 'main.ts', updatedAt: 1 })
    ).rejects.toThrow('lookup failed');
    expect(instantiate).not.toHaveBeenCalled();
  });
});
