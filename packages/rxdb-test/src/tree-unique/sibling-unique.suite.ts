/**
 * @fileoverview 树形实体「同级唯一」的跨适配器契约套件（RXT-010 / RXT-016）。
 *
 * @remarks
 * SQL 的 UNIQUE 认为每个 NULL 互不相等：根节点的 `parentId IS NULL`、
 * 文件夹的 `extension IS NULL` 都会让 `(parentId, name, extension)` 上的唯一索引
 * **整条失效**。三端 demo 的内存校验（`FilePathValidatorService` / `PathValidatorService`）
 * 一直是「同级、忽略大小写」，数据库却一行也拦不住 —— 并发创建、批量导入、
 * 直接 repository 写入都能造出重复路径。
 */
import { firstValueFrom } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';

import { generateTestDbName } from '../testing/generate-test-db-name.js';
import { TreeFile, TreeMenu } from './fixtures.js';
import type { TreeUniqueSuiteDatabase, TreeUniqueSuiteFactory } from './types.js';

/** 套件入口参数。 */
export interface TreeSiblingUniqueSuiteOptions {
  /** 被测 adapter 的接入点。 */
  readonly factory: TreeUniqueSuiteFactory;
}

interface FileSeed {
  readonly name: string;
  readonly type: 'file' | 'folder';
  readonly extension: string | null;
  readonly parentId?: string | null;
}

/**
 * 运行「同级唯一」契约套件。
 *
 * @param options - 被测 adapter 的接入点
 */
export function runTreeSiblingUniqueSuite(options: TreeSiblingUniqueSuiteOptions): void {
  const { factory } = options;

  describe(`tree sibling uniqueness contract (${factory.name})`, () => {
    let database: TreeUniqueSuiteDatabase;

    beforeEach(async () => {
      // 唯一约束是建表 DDL 的一部分，必须每个用例一座全新的库。
      database = await factory.createDatabase({
        dbName: generateTestDbName('tree_unique'),
        entities: [TreeFile, TreeMenu]
      });
      return async () => {
        await database.dispose();
      };
    });

    const saveFile = async (seed: FileSeed): Promise<TreeFile> => {
      const node = new TreeFile();
      node.name = seed.name;
      node.type = seed.type;
      node.extension = seed.extension;
      if (seed.parentId !== undefined) node.parentId = seed.parentId as TreeFile['parentId'];
      await node.save();
      return node;
    };

    const saveMenu = async (title: string, parentId?: string | null): Promise<TreeMenu> => {
      const menu = new TreeMenu();
      menu.title = title;
      if (parentId !== undefined) menu.parentId = parentId as TreeMenu['parentId'];
      await menu.save();
      return menu;
    };

    it('rejects a duplicate root file (parentId IS NULL)', async () => {
      await saveFile({ name: 'report', type: 'file', extension: '.docx' });

      await expect(saveFile({ name: 'report', type: 'file', extension: '.docx' })).rejects.toThrow();
      expect(await database.countRows(TreeFile)).toBe(1);
    });

    it('rejects a duplicate sub-folder (extension IS NULL)', async () => {
      const parent = await saveFile({ name: 'documents', type: 'folder', extension: null });
      await saveFile({ name: 'projects', type: 'folder', extension: null, parentId: parent.id });

      await expect(
        saveFile({ name: 'projects', type: 'folder', extension: null, parentId: parent.id })
      ).rejects.toThrow();
      expect(await database.countRows(TreeFile)).toBe(2);
    });

    it('rejects a case variant of an existing sibling', async () => {
      // 三端 demo 的内存校验是 `fullName.toLowerCase()` 比较，数据库必须与之同口径，
      // 否则 UI 拦下的重名换个大小写就能从 repository 直接写进去。
      await saveFile({ name: 'ReadMe', type: 'file', extension: '.MD' });

      await expect(saveFile({ name: 'readme', type: 'file', extension: '.md' })).rejects.toThrow();
      expect(await database.countRows(TreeFile)).toBe(1);
    });

    it('still accepts legitimately different siblings', async () => {
      // 反向用例：约束不能宽到拦不住重名，也不能严到把合法差异一并拒掉。
      const folder = await saveFile({ name: 'documents', type: 'folder', extension: null });
      await saveFile({ name: 'report', type: 'file', extension: '.docx' });
      await saveFile({ name: 'report', type: 'file', extension: '.pdf' });
      await saveFile({ name: 'summary', type: 'file', extension: '.docx' });
      await saveFile({ name: 'report', type: 'file', extension: '.docx', parentId: folder.id });

      expect(await database.countRows(TreeFile)).toBe(5);
    });

    it('does not confuse a NULL extension with an empty-string extension', async () => {
      // normalized 把 NULL 折成 ''：这会不会把「无扩展名」和「空扩展名」两行误判成重复？
      // 二者在业务上确实是同一个 fullName，所以**应该**冲突 —— 这条把口径钉死，
      // 免得日后有人「顺手」把 COALESCE 去掉。
      await saveFile({ name: 'notes', type: 'file', extension: null });

      await expect(saveFile({ name: 'notes', type: 'file', extension: '' })).rejects.toThrow();
      expect(await database.countRows(TreeFile)).toBe(1);
    });

    it('rejects duplicate sibling menu titles but allows the same title under another parent', async () => {
      const root = await saveMenu('Settings');
      await saveMenu('Profile', root.id);

      await expect(saveMenu('profile', root.id)).rejects.toThrow();
      expect(await database.countRows(TreeMenu)).toBe(2);

      const other = await saveMenu('System');
      await saveMenu('Profile', other.id);
      expect(await database.countRows(TreeMenu)).toBe(4);
    });

    it('lets exactly one of two concurrent duplicate writes land', async () => {
      // finding 明确要求并发双写：内存校验先读后写，两个并发写各自都读到「没有重名」。
      const settled = await Promise.allSettled([
        saveFile({ name: 'concurrent', type: 'file', extension: '.txt' }),
        saveFile({ name: 'concurrent', type: 'file', extension: '.txt' })
      ]);

      expect(settled.filter(result => result.status === 'fulfilled')).toHaveLength(1);
      expect(await database.countRows(TreeFile)).toBe(1);
    });

    it('keeps the surviving row readable after a rejected duplicate', async () => {
      // 被拒的那次写入不能把已落库的行连坐掉（同一事务里回滚过头）。
      const first = await saveFile({ name: 'keeper', type: 'file', extension: '.txt' });
      await expect(saveFile({ name: 'keeper', type: 'file', extension: '.txt' })).rejects.toThrow();

      database.rxdb.entityManager.cleanAllCache();
      const reread = await firstValueFrom(TreeFile.get(first.id));
      expect(reread?.name).toBe('keeper');
      expect(await database.countRows(TreeFile)).toBe(1);
    });
  });
}
