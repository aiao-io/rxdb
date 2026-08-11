import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import buildClientLibrary from '../../cli/build-client-lib.js';

/** 递归快照输出目录的全部内容，用于断言「失败时目录零变化」 */
const snapshotDir = async (dir: string): Promise<Record<string, string>> => {
  const snapshot: Record<string, string> = {};
  const walk = async (current: string): Promise<void> => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      snapshot[path.relative(dir, full).split(path.sep).join('/')] = await readFile(full, 'utf8');
    }
  };
  await walk(dir);
  return snapshot;
};

describe('RCG-003 空结果必须 fail-closed', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })));
  });

  const setup = async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'rxdb-client-generator-fail-closed-'));
    tempDirs.push(tempDir);
    const entityDir = path.join(tempDir, 'entities');
    const outDir = path.join(tempDir, 'generated');
    await mkdir(entityDir, { recursive: true });
    const entityFile = path.join(entityDir, 'User.ts');
    await writeFile(
      entityFile,
      `
        import { Entity } from '@aiao/rxdb';
        @Entity({ name: 'User', properties: [] })
        class User {}
      `,
      'utf8'
    );
    return { tempDir, entityDir, entityFile, outDir };
  };

  it('实体全部失去装饰器时拒绝，并且不删除上次生成物', async () => {
    const { entityFile, outDir } = await setup();
    await buildClientLibrary({ entities: [entityFile], outDir });
    const before = await snapshotDir(outDir);
    expect(Object.keys(before).length).toBeGreaterThan(1);

    // 装饰器被删掉（重构误删 / import 改动都会造成这个形态）
    await writeFile(entityFile, 'class User {}', 'utf8');

    await expect(buildClientLibrary({ entities: [entityFile], outDir })).rejects.toThrow(/entit/i);
    expect(await snapshotDir(outDir)).toEqual(before);
  });

  it('entities 为空数组时拒绝', async () => {
    const { outDir } = await setup();
    await expect(buildClientLibrary({ entities: [], outDir })).rejects.toThrow(/entit/i);
  });

  it('glob 零匹配时拒绝，并指出是哪个 pattern', async () => {
    const { tempDir, outDir } = await setup();
    const pattern = path.join(tempDir, 'nowhere', '*.ts');

    await expect(buildClientLibrary({ entities: [pattern], outDir })).rejects.toThrow(/nowhere/);
  });

  it('非 glob 路径不存在时拒绝，并指出是哪个路径', async () => {
    const { tempDir, outDir } = await setup();
    const missing = path.join(tempDir, 'entities', 'Missing.ts');

    await expect(buildClientLibrary({ entities: [missing], outDir })).rejects.toThrow(/Missing\.ts/);
  });

  it('allowEmpty 显式开启时才允许生成空客户端', async () => {
    const { entityFile, outDir } = await setup();
    await buildClientLibrary({ entities: [entityFile], outDir });
    await writeFile(entityFile, 'class User {}', 'utf8');

    await buildClientLibrary({ entities: [entityFile], outDir, allowEmpty: true });

    const after = await snapshotDir(outDir);
    expect(Object.keys(after).some(file => file.startsWith('User'))).toBe(false);
  });

  it('allowEmpty 同样放行空 entities 与零匹配 glob', async () => {
    const { tempDir, outDir } = await setup();

    await expect(buildClientLibrary({ entities: [], outDir, allowEmpty: true })).resolves.toBeUndefined();
    await expect(
      buildClientLibrary({ entities: [path.join(tempDir, 'nowhere', '*.ts')], outDir, allowEmpty: true })
    ).resolves.toBeUndefined();
  });
});
