import type { EntityType, RxDB } from '@aiao/rxdb';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { readAnonymousAssets } from './import-anonymous.js';
vi.mock('@aiao/rxdb', () => ({ getEntityMetadata: (entity: { name: string }) => ({ name: entity.name }) }));
class AssetCategory {}
class Asset {}
class Unrelated {}
function database(rows: Map<unknown, Record<string, unknown>[]>) {
  const getRepository = vi.fn(entity => ({ findAll: () => of(rows.get(entity) ?? []) }));
  return { database: { entityManager: { getRepository } } as unknown as RxDB, getRepository };
}
describe('explicit anonymous import boundary', () => {
  it('copies only known fields and original identifiers without touching source rows or unrelated entities', async () => {
    const original = { id: 'category', name: 'Local', localOnly: 'keep' };
    const { database: source, getRepository } = database(new Map([[AssetCategory, [original]]]));
    const result = await readAnonymousAssets(source, [AssetCategory, Unrelated] as EntityType[]);
    expect(result).toEqual({ category: { entity: 'AssetCategory', fields: { name: 'Local' } } });
    expect(original).toEqual({ id: 'category', name: 'Local', localOnly: 'keep' });
    expect(getRepository).toHaveBeenCalledTimes(1);
  });
  it('rejects cross-entity identifier collisions instead of silently replacing a source record', async () => {
    const { database: source } = database(
      new Map<unknown, Record<string, unknown>[]>([
        [AssetCategory, [{ id: 'same', name: 'Category' }]],
        [Asset, [{ id: 'same', name: 'Asset', status: 'active' }]]
      ])
    );
    await expect(readAnonymousAssets(source, [AssetCategory, Asset] as EntityType[])).rejects.toMatchObject({
      code: 'conflict'
    });
  });
  it('serializes runtime Date values as date-only contract values', async () => {
    const { database: source } = database(
      new Map([[Asset, [{ id: 'asset', name: 'Asset', purchaseDate: new Date('2026-11-16T12:34:56.000Z') }]]])
    );
    await expect(readAnonymousAssets(source, [Asset] as EntityType[])).resolves.toEqual({
      asset: { entity: 'Asset', fields: { name: 'Asset', purchaseDate: '2026-11-16' } }
    });
  });
});
