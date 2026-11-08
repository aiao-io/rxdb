import type { RxDBEvent } from '@aiao/rxdb';
import { describe, expect, it, vi } from 'vitest';
import { LocalPreference } from './browser-media';
import { localRepository } from './local-repository';

function rig() {
  const value = Object.assign(Object.create(LocalPreference.prototype) as LocalPreference, {
    id: '00000000-0000-4000-8000-000000000001',
    key: 'tasks-v1',
    payload: 'before',
    revision: 1,
    createdAt: new Date('2026-10-24T00:00:00Z'),
    updatedAt: new Date('2026-10-24T00:00:00Z')
  });
  const raw = {
    find: vi.fn(async () => [value]),
    count: vi.fn(async () => 1),
    create: vi.fn(async (row: LocalPreference) => row),
    update: vi.fn(async (row: LocalPreference, patch: Partial<LocalPreference>) => Object.assign(row, patch)),
    remove: vi.fn(async (row: LocalPreference) => {
      row.payload = '';
      return row;
    })
  };
  const events: RxDBEvent[] = [];
  return { value, raw, events, repository: localRepository(LocalPreference, raw, event => events.push(event)) };
}

describe('local repositories without persistent change logs', () => {
  it('publishes detached before and after images through standard RxDB events', async () => {
    const r = rig();
    await r.repository.create(r.value);
    await r.repository.update(r.value, { payload: 'after', revision: 2 });
    await r.repository.remove(r.value);
    expect(r.events).toMatchObject([
      {
        type: 'ENTITY_LOCAL_CREATE',
        entities: [{ namespace: 'media', entity: 'LocalPreference', patch: { payload: 'before' }, inversePatch: null }]
      },
      { type: 'ENTITY_LOCAL_UPDATE', entities: [{ patch: { payload: 'after' }, inversePatch: { payload: 'before' } }] },
      { type: 'ENTITY_LOCAL_REMOVE', entities: [{ id: r.value.id, patch: null, inversePatch: { payload: 'after' } }] }
    ]);
  });
  it('keeps failed writes out of the event stream', async () => {
    const r = rig();
    r.raw.update.mockRejectedValueOnce(new Error('write failed'));
    await expect(r.repository.update(r.value, { payload: 'after' })).rejects.toThrow('write failed');
    expect(r.events).toEqual([]);
  });
  it('includes complete rows for another window whose query did not match the original creation', async () => {
    const r = rig();
    await r.repository.update(r.value, { payload: 'after', revision: 2 });
    expect(r.events).toMatchObject([
      { entities: [{ patch: { payload: 'after', revision: 2 }, inversePatch: { payload: 'before', revision: 1 } }] }
    ]);
    const event = r.events[0];
    if (event.type !== 'ENTITY_LOCAL_UPDATE') throw new Error('Expected update event');
    expect(event.entities[0].patch).toMatchObject({ id: r.value.id, key: 'tasks-v1', payload: 'after', revision: 2 });
    expect(Object.keys(event.entities[0].patch).sort()).toEqual(Object.keys(event.entities[0].inversePatch).sort());
  });
  it('does not publish events for reads', async () => {
    const r = rig();
    const options = { where: { combinator: 'and' as const, rules: [] } };
    expect(await r.repository.find(options)).toEqual([r.value]);
    expect(await r.repository.count(options)).toBe(1);
    expect(r.events).toEqual([]);
  });
});
