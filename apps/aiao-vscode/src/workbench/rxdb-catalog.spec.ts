import type { RxDB } from '@aiao/rxdb';
import { Orientation, type SerializedDockview } from 'dockview-core';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { githubProjectInfo } from './catalog.js';
import {
  createRxDBWorkbenchCatalog,
  WorkbenchLayoutState,
  WorkbenchProject,
  WorkbenchRemoteProject,
  WorkbenchSessionState
} from './rxdb-catalog.js';

describe('RxDB workbench project catalog', () => {
  it('maps repository entities to catalog entries in the supplied database', async () => {
    const record = { id: 'project', name: 'name', template: 'vue', entry: 'src/main.ts', lastOpenedAt: 3 };
    const repository = { findAll: vi.fn(() => of([record])) };
    const getRepository = vi.fn((entity: unknown) =>
      entity === WorkbenchRemoteProject ? { findAll: vi.fn(() => of([])) } : repository
    );
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

  it('reads missing session state as null and persists state through the state repository', async () => {
    const record = {
      id: 'project',
      tabs: ['src/main.ts'],
      activePath: 'src/main.ts',
      updatedAt: 1,
      save: vi.fn(async () => undefined)
    };
    const stateRepository = {
      findOne: vi
        .fn()
        .mockReturnValueOnce(of(undefined))
        .mockReturnValueOnce(of(record))
        .mockReturnValueOnce(of(undefined))
    };
    const getRepository = vi.fn((entity: unknown) => {
      if (entity === WorkbenchSessionState) return stateRepository;
      return { findAll: () => of([]), findOne: () => of(undefined) };
    });
    const instantiate = vi.fn(() => record);
    const db = { entityManager: { instantiate, getRepository } } as unknown as RxDB;
    const catalog = createRxDBWorkbenchCatalog(db);
    await expect(catalog.getState('project')).resolves.toBeNull();
    await expect(catalog.getState('project')).resolves.toEqual({ tabs: ['src/main.ts'], activePath: 'src/main.ts' });
    await catalog.putState('project', { tabs: ['src/label.ts'], activePath: 'src/label.ts' });
    expect(instantiate).toHaveBeenCalledWith(WorkbenchSessionState, { id: 'project' });
    expect(record.tabs).toEqual(['src/label.ts']);
    expect(record.activePath).toBe('src/label.ts');
    expect(record.save).toHaveBeenCalledOnce();
  });

  it('reads a missing layout as null and persists per-project layouts through the layout repository', async () => {
    const layout: SerializedDockview = {
      grid: {
        root: { type: 'branch', size: 800, data: [] },
        width: 960,
        height: 800,
        orientation: Orientation.HORIZONTAL
      },
      panels: {}
    };
    const record = {
      id: 'project',
      layout: undefined as unknown,
      lastTouchedAt: 0,
      save: vi.fn(async () => undefined)
    };
    const layoutRepository = {
      findOne: vi
        .fn()
        .mockReturnValueOnce(of(undefined))
        .mockReturnValueOnce(of(undefined))
        .mockReturnValueOnce(of(record))
    };
    const getRepository = vi.fn((entity: unknown) => {
      if (entity === WorkbenchLayoutState) return layoutRepository;
      return { findAll: () => of([]), findOne: () => of(undefined) };
    });
    const instantiate = vi.fn(() => record);
    const db = { entityManager: { instantiate, getRepository } } as unknown as RxDB;
    const catalog = createRxDBWorkbenchCatalog(db);
    await expect(catalog.getLayout('project')).resolves.toBeNull();
    await catalog.putLayout('project', layout);
    expect(instantiate).toHaveBeenCalledWith(WorkbenchLayoutState, { id: 'project' });
    expect(record.layout).toEqual(layout);
    expect(record.lastTouchedAt).toBeGreaterThan(0);
    expect(record.save).toHaveBeenCalledOnce();
    await expect(catalog.getLayout('project')).resolves.toEqual(layout);
    expect(layoutRepository.findOne).toHaveBeenCalledWith({
      where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: 'project' }] }
    });
  });

  it('lists remote GitHub entries alongside local projects', async () => {
    const remoteRecord = {
      id: 'github:octo/repo@main',
      name: 'octo/repo',
      remoteOwner: 'octo',
      remoteRepo: 'repo',
      remoteBranch: 'main',
      lastOpenedAt: 7
    };
    const localRepository = {
      findAll: vi.fn(() => of([{ id: 'local', name: 'n', template: 'react', entry: 'e', lastOpenedAt: 1 }]))
    };
    const remoteRepository = { findAll: vi.fn(() => of([remoteRecord])) };
    const getRepository = vi.fn((entity: unknown) =>
      entity === WorkbenchRemoteProject ? remoteRepository : localRepository
    );
    const db = { entityManager: { getRepository } } as unknown as RxDB;
    await expect(createRxDBWorkbenchCatalog(db).list()).resolves.toEqual([
      { id: 'local', name: 'n', template: 'react', entry: 'e', updatedAt: 1 },
      {
        id: 'github:octo/repo@main',
        name: 'octo/repo',
        template: 'vanilla',
        entry: '',
        updatedAt: 7,
        remote: { kind: 'github', owner: 'octo', repo: 'repo', branch: 'main' }
      }
    ]);
  });

  it('persists remote entries through the remote repository', async () => {
    const record = {
      id: 'github:octo/repo@main',
      name: '',
      remoteOwner: '',
      remoteRepo: '',
      remoteBranch: '',
      lastOpenedAt: 0,
      save: vi.fn(async () => undefined)
    };
    const remoteRepository = { findOne: vi.fn(() => of(undefined)) };
    const getRepository = vi.fn((entity: unknown) =>
      entity === WorkbenchRemoteProject ? remoteRepository : { findOne: vi.fn(() => of(undefined)) }
    );
    const instantiate = vi.fn(() => record);
    const db = { entityManager: { instantiate, getRepository } } as unknown as RxDB;
    const catalog = createRxDBWorkbenchCatalog(db);
    await catalog.put(githubProjectInfo('octo', 'repo', 'main', 9));
    expect(instantiate).toHaveBeenCalledWith(WorkbenchRemoteProject, { id: 'github:octo/repo@main' });
    expect(record.name).toBe('octo/repo');
    expect(record.remoteOwner).toBe('octo');
    expect(record.remoteRepo).toBe('repo');
    expect(record.remoteBranch).toBe('main');
    expect(record.lastOpenedAt).toBe(9);
    expect(record.save).toHaveBeenCalledOnce();
  });
});
