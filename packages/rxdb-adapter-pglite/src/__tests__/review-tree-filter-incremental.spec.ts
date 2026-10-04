import { RxDB, SyncType } from '@aiao/rxdb';
import { rxDBPluginTree, type FindTreeOptions, type ITreeRepository } from '@aiao/rxdb-plugin-tree';
import { MenuSimple } from '@aiao/rxdb-test/entities';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../RxDBAdapterPGlite.js';

let db: RxDB;
let tree: ITreeRepository<typeof MenuSimple>;
let root: MenuSimple;
let child: MenuSimple;

beforeAll(async () => {
  db = new RxDB({
    dbName: `review-tree-scalar-${crypto.randomUUID()}`,
    entities: [MenuSimple],
    multiInstance: false,
    sync: { type: SyncType.None, local: { adapter: 'pglite' } }
  });
  const adapter = new RxDBAdapterPGlite(db, { store: 'memory' });
  db.adapter('pglite', () => adapter);
  db.use(rxDBPluginTree);
  await db.connect('pglite');
  root = db.entityManager.instantiate(MenuSimple);
  root.title = 'visible-root';
  await root.save();
  child = db.entityManager.instantiate(MenuSimple);
  child.title = 'visible-child';
  child.parentId = root.id;
  await child.save();
  tree = adapter.getRepository<typeof MenuSimple, ITreeRepository<typeof MenuSimple>>(MenuSimple);
});

afterAll(async () => {
  await db?.destroy();
});

const filtered = (entityId: MenuSimple['id']): FindTreeOptions<typeof MenuSimple> => ({
  entityId,
  where: { combinator: 'and', rules: [{ field: 'title', operator: 'contains', value: 'visible' }] }
});

describe('评审：PGlite 树查询的普通字段条件必须能执行', () => {
  it('findDescendants(title) 不能抛列名歧义', async () => {
    await expect(tree.findDescendants(filtered(root.id))).resolves.toHaveLength(2);
  });
  it('findAncestors(title) 不能抛列名歧义', async () => {
    await expect(tree.findAncestors(filtered(child.id))).resolves.toHaveLength(2);
  });
  it('countDescendants(title) 不能抛列名歧义', async () => {
    await expect(tree.countDescendants(filtered(root.id))).resolves.toBe(1);
  });
  it('countAncestors(title) 不能抛列名歧义', async () => {
    await expect(tree.countAncestors(filtered(child.id))).resolves.toBe(1);
  });
  it('对照：无筛选后代查询正常执行', async () => {
    await expect(tree.findDescendants({ entityId: root.id })).resolves.toHaveLength(2);
  });
  it('对照：无筛选祖先计数正常执行', async () => {
    await expect(tree.countAncestors({ entityId: child.id })).resolves.toBe(1);
  });
});
