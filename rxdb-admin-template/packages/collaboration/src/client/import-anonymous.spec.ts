import type { EntityType, RxDB } from '@aiao/rxdb';
import { of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { assetSchema } from '../schema.testing.js';
import { readAnonymousRecords } from './import-anonymous.js';
import { useTranslation } from './translate.js';
// 只替换实体元数据的读取（测试用的空类没有装饰器），清单解析仍用平台的真实实现
vi.mock('@aiao/rxdb', async importOriginal => ({
  ...(await importOriginal<typeof import('@aiao/rxdb')>()),
  getEntityMetadata: (entity: { name: string }) => ({ name: entity.name })
}));
class AssetCategory {}
class Asset {}
class Unrelated {}
function database(rows: Map<unknown, Record<string, unknown>[]>) {
  const getRepository = vi.fn(entity => ({ findAll: () => of(rows.get(entity) ?? []) }));
  return { database: { entityManager: { getRepository } } as unknown as RxDB, getRepository };
}
afterEach(() => {
  useTranslation(undefined);
});
describe('explicit anonymous import boundary', () => {
  it('copies only known fields and original identifiers without touching source rows or unrelated entities', async () => {
    const original = { id: 'category', name: 'Local', localOnly: 'keep' };
    const { database: source, getRepository } = database(new Map([[AssetCategory, [original]]]));
    const result = await readAnonymousRecords(source, [AssetCategory, Unrelated] as EntityType[], assetSchema);
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
    await expect(
      readAnonymousRecords(source, [AssetCategory, Asset] as EntityType[], assetSchema)
    ).rejects.toMatchObject({
      code: 'conflict'
    });
  });
  it('serializes runtime Date values as date-only contract values', async () => {
    const { database: source } = database(
      new Map([[Asset, [{ id: 'asset', name: 'Asset', purchaseDate: new Date('2026-11-16T12:34:56.000Z') }]]])
    );
    await expect(readAnonymousRecords(source, [Asset] as EntityType[], assetSchema)).resolves.toEqual({
      asset: { entity: 'Asset', fields: { name: 'Asset', purchaseDate: '2026-11-16' } }
    });
  });
  it('reports an invalid runtime Date by field through the translation catalog', async () => {
    const { database: source } = database(
      new Map([[Asset, [{ id: 'asset', name: 'Asset', purchaseDate: new Date('not a date') }]]])
    );
    const read = () => readAnonymousRecords(source, [Asset] as EntityType[], assetSchema);
    await expect(read()).rejects.toMatchObject({ code: 'invalid', message: 'purchaseDate 日期格式错误' });
    useTranslation((key, values) => `${key}|${values['v0']}`);
    await expect(read()).rejects.toMatchObject({ message: 'collaboration.{v0} 日期格式错误|purchaseDate' });
  });
});
