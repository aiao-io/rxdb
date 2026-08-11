import { Entity, EntityBase, getEntityMetadata, getEntityStatus, PropertyType, RxDB, SyncType } from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { firstValueFrom } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../RxDBAdapterPGlite.js';

@Entity({
  name: 'Pgl015Note',
  tableName: 'pgl015_notes',
  properties: [{ name: 'label', type: PropertyType.string, required: true }]
})
class Pgl015Note extends EntityBase {
  declare label: string;
}

@Entity({
  name: 'Pgl015Missing',
  tableName: 'pgl015_missing',
  properties: [{ name: 'label', type: PropertyType.string, required: true }]
})
class Pgl015Missing extends EntityBase {
  declare label: string;
}

describe('RxDBAdapterPGlite residual unit edges', () => {
  let rxdb: RxDB | undefined;
  let adapter: RxDBAdapterPGlite;

  afterEach(async () => {
    if (rxdb) await rxdb.disconnectAll();
    rxdb = undefined;
  });

  const setup = async () => {
    rxdb = new RxDB({
      dbName: `adapter-residual-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      context: { userId: 'creator-user' },
      entities: [Todo, Pgl015Note],
      sync: { local: { adapter: 'pglite' }, type: SyncType.None }
    });
    rxdb.adapter('pglite', db => {
      adapter = new RxDBAdapterPGlite(db, { store: 'memory' });
      return adapter;
    });
    await rxdb.connect('pglite');
    return adapter;
  };

  it('covers empty save/remove, unsupported repository, restoreEntity, encryption errors', async () => {
    const ad = await setup();

    await expect(ad.saveMany([])).resolves.toEqual([]);
    await expect(ad.saveMany(null as never)).resolves.toEqual([]);
    await expect(ad.removeMany([])).resolves.toEqual([]);
    await expect(ad.removeMany(null as never)).resolves.toEqual([]);

    const meta = getEntityMetadata(Todo);
    const originalRepo = meta.repository;
    Object.defineProperty(meta, 'repository', { value: 'CustomRepository', configurable: true });
    try {
      expect(() => ad.getRepository(Todo)).toThrow(/Unsupported repository type/);
    } finally {
      Object.defineProperty(meta, 'repository', { value: originalRepo, configurable: true });
    }

    // restoreEntity 会同步抛错（不会返回 rejected promise）。
    expect(() => ad.restoreEntity({} as never, {} as never)).toThrow(/not yet implemented/);

    expect(() => ad.encryption.isLocked).toThrow(/no_encrypted_columns|encrypted/i);
    expect(() => ad.encryption.lock()).toThrow(/no_encrypted_columns|encrypted/i);
    await expect(ad.encryption.unlock({ passphrase: 'x' } as never)).rejects.toThrow(/no_encrypted_columns|encrypted/i);
    expect(() => ad.encryption.lockChange$).toThrow(/no_encrypted_columns|encrypted/i);
  });

  it('getMetadataByIds and upsertMany empty early return', async () => {
    const ad = await setup();

    const empty = await firstValueFrom(ad.getMetadataByIds('Todo', []));
    expect(empty.size).toBe(0);

    await firstValueFrom(ad.upsertMany('Todo', []));
  });

  it('saveMany persists entities and marks local status', async () => {
    const ad = await setup();
    const todo = new Todo();
    todo.title = `save-many-${Date.now()}`;
    todo.completed = false;

    const saved = await ad.saveMany([todo]);
    expect(saved).toHaveLength(1);
    const status = getEntityStatus(todo);
    expect(status.local).toBe(true);
    expect(status.modified).toBe(false);

    const rows = await ad.query('SELECT title FROM "public"."todos" WHERE id = $1', [todo.id]);
    expect(rows.rows[0]?.title).toBe(todo.title);
  });

  it('saveMany upserts an entity that already exists', async () => {
    const ad = await setup();
    const todo = new Todo({ title: 'before-upsert', completed: false });
    await ad.saveMany([todo]);

    todo.title = 'after-upsert';
    todo.completed = true;
    await expect(ad.saveMany([todo])).resolves.toEqual([todo]);

    const rows = await ad.query<{ title: string; completed: boolean }>(
      'SELECT title, completed FROM "public"."todos" WHERE id = $1',
      [todo.id]
    );
    expect(rows.rows).toEqual([{ title: 'after-upsert', completed: true }]);
  });

  it('saveMany resolves duplicate ids in one batch with the last entity', async () => {
    const ad = await setup();
    const first = new Todo({ title: 'first-value', completed: false });
    const last = new Todo({ id: first.id, title: 'last-value', completed: true } as never);

    await expect(ad.saveMany([first, last])).resolves.toEqual([first, last]);

    const rows = await ad.query<{ title: string; completed: boolean }>(
      'SELECT title, completed FROM "public"."todos" WHERE id = $1',
      [first.id]
    );
    expect(rows.rows).toEqual([{ title: 'last-value', completed: true }]);
  });

  it('saveMany preserves creation audit fields on conflict', async () => {
    const ad = await setup();
    const todo = new Todo({ title: 'audit-before', completed: false });
    await ad.saveMany([todo]);

    rxdb!.context = { userId: 'updater-user' };
    todo.title = 'audit-after';
    await ad.saveMany([todo]);

    const rows = await ad.query<{ createdBy: string; updatedBy: string; title: string }>(
      'SELECT "createdBy", "updatedBy", title FROM "public"."todos" WHERE id = $1',
      [todo.id]
    );
    expect(rows.rows).toEqual([{ createdBy: 'creator-user', updatedBy: 'updater-user', title: 'audit-after' }]);
  });

  it('saveMany and removeMany support mixed entity types', async () => {
    const ad = await setup();
    const todo = new Todo({ title: 'mixed-todo', completed: false });
    const note = new Pgl015Note({ label: 'mixed-note' });

    await expect(ad.saveMany([todo, note] as never)).resolves.toEqual([todo, note]);
    expect((await ad.query('SELECT id FROM "public"."todos" WHERE id = $1', [todo.id])).rows).toHaveLength(1);
    expect((await ad.query('SELECT id FROM "public"."pgl015_notes" WHERE id = $1', [note.id])).rows).toHaveLength(1);

    await expect(ad.removeMany([todo, note] as never)).resolves.toEqual([todo, note]);
    expect((await ad.query('SELECT id FROM "public"."todos" WHERE id = $1', [todo.id])).rows).toHaveLength(0);
    expect((await ad.query('SELECT id FROM "public"."pgl015_notes" WHERE id = $1', [note.id])).rows).toHaveLength(0);
  });

  it('saveMany rolls back prior groups and status when a later group fails', async () => {
    const ad = await setup();
    const todo = new Todo({ title: 'must-roll-back', completed: false });
    const missing = Object.assign(Object.create(Pgl015Missing.prototype), {
      id: '00000000-0000-4000-8000-000000000015',
      createdAt: new Date(),
      updatedAt: new Date(),
      label: 'missing-table'
    }) as Pgl015Missing;
    const status = getEntityStatus(todo);
    const statusBefore = { local: status.local, modified: status.modified };

    await expect(ad.saveMany([todo, missing] as never)).rejects.toThrow();

    expect({ local: status.local, modified: status.modified }).toEqual(statusBefore);
    expect((await ad.query('SELECT id FROM "public"."todos" WHERE id = $1', [todo.id])).rows).toHaveLength(0);
  });

  it('removeMany executes a batch above the PostgreSQL parameter limit', { timeout: 30_000 }, async () => {
    const ad = await setup();
    const todo = new Todo({ title: 'large-delete', completed: false });
    const entities = Array.from({ length: 65_536 }, () => todo);

    await expect(ad.removeMany(entities)).resolves.toBe(entities);
  });

  it('local branch/change repos and createBranch flush pipeline', async () => {
    const ad = await setup();
    expect(ad.localRxDBBranch()).toBeTruthy();
    expect(ad.localRxDBChange()).toBeTruthy();
    const branch = await ad.createBranch(`residual-branch-${Date.now()}`);
    expect(branch).toBeTruthy();
  });
});
