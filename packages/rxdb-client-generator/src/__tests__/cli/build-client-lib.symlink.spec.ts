import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import buildClientLibrary from '../../cli/build-client-lib.js';

const MANIFEST = '.rxdb-client-generator-manifest.json';

const pathExists = async (filePath: string): Promise<boolean> => {
  try {
    await lstat(filePath);
    return true;
  } catch {
    return false;
  }
};

describe('RCG-004 输出目录里的软链不得被跟随', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })));
  });

  const setup = async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'rxdb-client-generator-symlink-'));
    tempDirs.push(tempDir);
    const entityDir = path.join(tempDir, 'entities');
    const outDir = path.join(tempDir, 'generated');
    const outsideDir = path.join(tempDir, 'outside');
    await mkdir(entityDir, { recursive: true });
    await mkdir(outsideDir, { recursive: true });
    const entityFile = path.join(entityDir, 'entity.ts');
    await writeFile(
      entityFile,
      `
        import { Entity, EntityBase } from '@aiao/rxdb';
        @Entity({ name: 'Widget', properties: [] })
        class Widget extends EntityBase {}
      `,
      'utf8'
    );
    return { entityFile, outDir, outsideDir, tempDir };
  };

  it('生成文件位置是软链时，不得写穿到链接目标', async () => {
    const { entityFile, outDir, outsideDir } = await setup();
    const victim = path.join(outsideDir, 'victim.ts');
    await writeFile(victim, 'export const untouched = true;\n', 'utf8');
    await mkdir(outDir, { recursive: true });
    await symlink(victim, path.join(outDir, 'index.js'));

    await buildClientLibrary({ entities: [entityFile], outDir }).catch(() => undefined);

    expect(await readFile(victim, 'utf8')).toEqual('export const untouched = true;\n');
  });

  it('manifest 是软链时，不得写穿到链接目标', async () => {
    const { entityFile, outDir, outsideDir } = await setup();
    const victim = path.join(outsideDir, 'victim.json');
    await writeFile(victim, '{"keep":true}\n', 'utf8');
    await mkdir(outDir, { recursive: true });
    await symlink(victim, path.join(outDir, MANIFEST));

    await buildClientLibrary({ entities: [entityFile], outDir }).catch(() => undefined);

    expect(await readFile(victim, 'utf8')).toEqual('{"keep":true}\n');
  });

  it('陈旧文件清理不得穿过软链目录删掉外部文件', async () => {
    const { entityFile, outDir, outsideDir } = await setup();
    const victim = path.join(outsideDir, 'important.js');
    await writeFile(victim, 'keep me\n', 'utf8');
    await mkdir(outDir, { recursive: true });
    await symlink(outsideDir, path.join(outDir, 'linked'));
    // 上一轮 manifest 声称 linked/important.js 是自己的产物
    await writeFile(
      path.join(outDir, MANIFEST),
      JSON.stringify({ version: 1, files: ['linked/important.js'] }, null, 2),
      'utf8'
    );

    await buildClientLibrary({ entities: [entityFile], outDir }).catch(() => undefined);

    expect(await pathExists(victim)).toBe(true);
    expect(await readFile(victim, 'utf8')).toEqual('keep me\n');
  });

  it('软链别名指向同一物理目录时，并发构建必须串行化', async () => {
    const { entityFile, outDir } = await setup();
    await mkdir(outDir, { recursive: true });
    const aliasDir = path.join(path.dirname(outDir), 'generated-alias');
    await symlink(outDir, aliasDir);

    await Promise.all([
      buildClientLibrary({ entities: [entityFile], outDir }),
      buildClientLibrary({ entities: [entityFile], outDir: aliasDir })
    ]);

    const manifest = JSON.parse(await readFile(path.join(outDir, MANIFEST), 'utf8'));
    expect(manifest.files).toEqual(expect.arrayContaining(['index.js', 'index.d.ts']));
    // 两条队列各写各的会互相删除对方的产物，最终 manifest 与磁盘对不上
    for (const file of manifest.files) {
      expect(await pathExists(path.join(outDir, file))).toBe(true);
    }
  });
});
