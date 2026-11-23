import { describe, expect, it } from 'vitest';

import { FakeDesktopData, FakeRepository, enforceDesktopFileIndex } from './fake-desktop-data';

describe('FakeRepository', () => {
  it('find 按规则过滤、按 orderBy 排序、按 limit 截断', async () => {
    const repo = new FakeRepository<{ id?: string; n: number; tag: string }>();
    repo.seed([
      { n: 3, tag: 'a' },
      { n: 1, tag: 'b' },
      { n: 2, tag: 'a' }
    ]);
    const where = { combinator: 'and', rules: [{ field: 'tag', operator: '=', value: 'a' }] } as const;
    expect((await repo.find({ where, orderBy: [{ field: 'n', sort: 'asc' }] })).map(row => row.n)).toEqual([2, 3]);
    expect((await repo.find({ orderBy: [{ field: 'n', sort: 'desc' }], limit: 2 })).map(row => row.n)).toEqual([3, 2]);
    await expect(
      repo.find({ where: { combinator: 'and', rules: [{ field: 'n', operator: '>', value: 1 }] } })
    ).rejects.toThrow('替身仓储只支持 = 与 startsWith 条件');
  });

  it('find 支持 startsWith：按字段值的前缀过滤，可与 = 条件叠加', async () => {
    const repo = new FakeRepository<{ id?: string; key: string; kind: string }>();
    repo.seed([
      { key: 'windows:layout:a', kind: 'x' },
      { key: 'windows:layout:b', kind: 'y' },
      { key: 'windows:layoutX', kind: 'x' },
      { key: 'dock:layout', kind: 'x' }
    ]);
    const prefix = { field: 'key', operator: 'startsWith', value: 'windows:layout:' } as const;
    expect((await repo.find({ where: { combinator: 'and', rules: [prefix] } })).map(row => row.key)).toEqual([
      'windows:layout:a',
      'windows:layout:b'
    ]);
    const both = { combinator: 'and', rules: [prefix, { field: 'kind', operator: '=', value: 'y' }] } as const;
    expect((await repo.find({ where: both })).map(row => row.key)).toEqual(['windows:layout:b']);
  });
});

describe('FakeRepository 的唯一索引替身', () => {
  type Row = { id?: string; name: string; parentId?: string | null };
  const setup = () => {
    const repo = new FakeRepository<Row>();
    enforceDesktopFileIndex(repo);
    return repo;
  };

  it('同一父目录下重名抛 SQLite 的约束错误；换个父目录、换个名字都可以', async () => {
    const repo = setup();
    await repo.create({ name: 'a.txt', parentId: 'p' });
    await expect(repo.create({ name: 'a.txt', parentId: 'p' })).rejects.toThrow(
      "UNIQUE constraint failed: index 'desktop_file_parent_name'"
    );
    await repo.create({ name: 'a.txt', parentId: 'q' });
    await repo.create({ name: 'b.txt', parentId: 'p' });
    await repo.create({ name: 'a.txt', parentId: null });
    expect(repo.rows).toHaveLength(4);
  });

  it('归一化：只在大小写上不同的名字也算重名；根目录（没有父 id）之下同样；非 ASCII 字母不折叠（与 SQLite 的 lower 一致）', async () => {
    const repo = setup();
    await repo.create({ name: 'Report.txt', parentId: 'p' });
    await expect(repo.create({ name: 'report.txt', parentId: 'p' })).rejects.toThrow('UNIQUE constraint failed');
    await repo.create({ name: 'Users' });
    await expect(repo.create({ name: 'users', parentId: null })).rejects.toThrow('UNIQUE constraint failed');
    await repo.create({ name: 'É.txt', parentId: 'p' });
    await repo.create({ name: 'é.txt', parentId: 'p' });
  });

  it('更新一行时不和它自己比：纯大小写改名可以；改成别人的名字抛错并且这一行不变', async () => {
    const repo = setup();
    const report = await repo.create({ name: 'Report.txt', parentId: 'p' });
    await repo.create({ name: 'notes.txt', parentId: 'p' });
    await repo.update(report, { name: 'report.txt' });
    expect(report.name).toBe('report.txt');
    await expect(repo.update(report, { name: 'NOTES.txt' })).rejects.toThrow('UNIQUE constraint failed');
    expect(report.name).toBe('report.txt');
  });

  it('没有装替身的表不检查', async () => {
    const repo = new FakeRepository<Row>();
    await repo.create({ name: 'a', parentId: 'p' });
    await repo.create({ name: 'a', parentId: 'p' });
    expect(repo.rows).toHaveLength(2);
  });
});

describe('FakeDesktopData', () => {
  it('每个实体类型一张表，同一类型总是同一张', () => {
    class A {}
    class B {}
    const data = new FakeDesktopData();
    expect(data.table(A)).toBe(data.table(A));
    expect(data.table(A)).not.toBe(data.table(B));
  });

  it('storage 的上传、读取、按目录清空与删除', async () => {
    const { storage } = new FakeDesktopData();
    const first = await storage.upload(new File(['one'], 'a', { type: 'text/plain' }), { path: 'blobs' });
    const second = await storage.upload(new File(['two'], 'b'), { path: 'other' });
    expect(await (await storage.read(first.id)).text()).toBe('one');

    await storage.clear('blobs');
    expect([...storage.blobs.keys()]).toEqual([second.id]);
    await storage.delete(second.id);
    expect(storage.blobs.size).toBe(0);
    await expect(storage.read(second.id)).rejects.toThrow('没有文件体');
  });
});
