import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import buildClientLibrary from '../../cli/build-client-lib.js';

const snapshotDir = async (dir: string): Promise<Record<string, string>> => {
  const snapshot: Record<string, string> = {};
  const walk = async (current: string): Promise<void> => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        snapshot[`${path.relative(dir, full).split(path.sep).join('/')}/`] = '<dir>';
        await walk(full);
        continue;
      }
      snapshot[path.relative(dir, full).split(path.sep).join('/')] = await readFile(full, 'utf8');
    }
  };
  await walk(dir);
  return snapshot;
};

describe('RCG-005 输出写入必须是全有或全无', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })));
  });

  const setup = async (source: string) => {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'rxdb-client-generator-atomic-'));
    tempDirs.push(tempDir);
    const entityDir = path.join(tempDir, 'entities');
    const outDir = path.join(tempDir, 'generated');
    await mkdir(entityDir, { recursive: true });
    const entityFile = path.join(entityDir, 'entity.ts');
    await writeFile(entityFile, source, 'utf8');
    return { entityDir, entityFile, outDir, tempDir };
  };

  const GOOD_ENTITY = `
    import { Entity, EntityBase } from '@aiao/rxdb';
    @Entity({ name: 'Widget', properties: [] })
    class Widget extends EntityBase {}
  `;

  const COLLIDING_ENTITIES = `
    import { Entity, EntityBase } from '@aiao/rxdb';
    @Entity({ name: 'Widget', properties: [] })
    class Widget extends EntityBase {}
    @Entity({ name: 'widget', properties: [] })
    class widget extends EntityBase {}
  `;

  it('大小写碰撞被拒绝时，输出目录必须零变化', async () => {
    const { entityFile, outDir } = await setup(GOOD_ENTITY);
    await buildClientLibrary({ entities: [entityFile], outDir, splitFiles: true });
    const before = await snapshotDir(outDir);

    // 碰撞检测原先在写循环里：检测到 widget 时 Widget.js 已经被覆盖
    await writeFile(entityFile, COLLIDING_ENTITIES, 'utf8');
    await expect(buildClientLibrary({ entities: [entityFile], outDir, splitFiles: true })).rejects.toThrow(
      /colliding output/
    );

    expect(await snapshotDir(outDir)).toEqual(before);
  });

  it('首次构建碰撞被拒绝时，不得留下半套文件', async () => {
    const { entityFile, outDir } = await setup(COLLIDING_ENTITIES);

    await expect(buildClientLibrary({ entities: [entityFile], outDir, splitFiles: true })).rejects.toThrow(
      /colliding output/
    );

    const after = await snapshotDir(outDir).catch(() => ({}));
    expect(after).toEqual({});
  });

  it('写入中途失败时，既有产物与 manifest 都不变', async () => {
    const { entityFile, outDir } = await setup(GOOD_ENTITY);
    await buildClientLibrary({ entities: [entityFile], outDir, splitFiles: true });
    const before = await snapshotDir(outDir);

    // 第二次构建的内容必须与第一次**不同**，否则「中途写了一半」在快照里看不出来
    await writeFile(
      entityFile,
      `
        import { Entity, EntityBase } from '@aiao/rxdb';
        @Entity({ name: 'Widget', properties: [{ name: 'title', type: 'string' }] })
        class Widget extends EntityBase {}
      `,
      'utf8'
    );

    // 把某个目标文件替换成目录：writeFileSync 到它必然 EISDIR。
    // 必须挑**排序在后**的那个（Widget.js），否则它之前没有内容会变的文件，
    // 「写了一半」在快照里根本看不出来 —— Widget.d.ts 恰好排在它前面且内容会变。
    await rm(path.join(outDir, 'Widget.js'), { force: true });
    await mkdir(path.join(outDir, 'Widget.js'), { recursive: true });

    await expect(buildClientLibrary({ entities: [entityFile], outDir, splitFiles: true })).rejects.toThrow();

    const after = await snapshotDir(outDir);
    // Widget.js 现在是目录（测试自己造的），其余条目必须与构建前一致
    delete after['Widget.js/'];
    delete before['Widget.js'];
    expect(after).toEqual(before);
  });

  it('失败后不残留 staging 目录', async () => {
    const { entityFile, outDir } = await setup(COLLIDING_ENTITIES);

    await expect(buildClientLibrary({ entities: [entityFile], outDir, splitFiles: true })).rejects.toThrow();

    const entries = await readdir(outDir).catch(() => [] as string[]);
    expect(entries.filter(entry => entry.includes('tmp'))).toEqual([]);
  });

  it('成功构建后不残留 staging 目录，manifest 也不含它', async () => {
    const { entityFile, outDir } = await setup(GOOD_ENTITY);
    await buildClientLibrary({ entities: [entityFile], outDir, splitFiles: true });

    const entries = await readdir(outDir);
    expect(entries.filter(entry => entry.includes('tmp'))).toEqual([]);

    const manifest = JSON.parse(await readFile(path.join(outDir, '.rxdb-client-generator-manifest.json'), 'utf8'));
    expect(manifest.files.every((file: string) => !file.includes('tmp'))).toBe(true);
  });
});
