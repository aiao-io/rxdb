import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import buildClientLibrary from '../../cli/build-client-lib.js';

const pathExists = async (filePath: string): Promise<boolean> => {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
};

describe('buildClientLibrary edge guards', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })));
  });

  const setupEntity = async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'rxdb-client-generator-build-edge-'));
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
    return { tempDir, entityFile, outDir };
  };

  it('rejects invalid JSON manifest', async () => {
    const { entityFile, outDir } = await setupEntity();
    await mkdir(outDir, { recursive: true });
    await writeFile(path.join(outDir, '.rxdb-client-generator-manifest.json'), '{not-json', 'utf8');
    await expect(buildClientLibrary({ entities: [entityFile], outDir, splitFiles: false })).rejects.toThrow(
      /Invalid generator manifest/
    );
  });

  it('rejects manifest with wrong shape or duplicates', async () => {
    const { entityFile, outDir } = await setupEntity();
    await mkdir(outDir, { recursive: true });
    await writeFile(
      path.join(outDir, '.rxdb-client-generator-manifest.json'),
      JSON.stringify({ version: 2, files: ['a.js'] }),
      'utf8'
    );
    await expect(buildClientLibrary({ entities: [entityFile], outDir, splitFiles: false })).rejects.toThrow(
      /Invalid generator manifest/
    );

    await writeFile(
      path.join(outDir, '.rxdb-client-generator-manifest.json'),
      JSON.stringify({ version: 1, files: ['a.js', 'a.js'] }),
      'utf8'
    );
    await expect(buildClientLibrary({ entities: [entityFile], outDir, splitFiles: false })).rejects.toThrow(
      /duplicate files/
    );
  });

  it('rejects manifest paths that escape the output directory', async () => {
    const { entityFile, outDir } = await setupEntity();
    await mkdir(outDir, { recursive: true });
    await writeFile(
      path.join(outDir, '.rxdb-client-generator-manifest.json'),
      JSON.stringify({ version: 1, files: ['../escape.js'] }),
      'utf8'
    );
    await expect(buildClientLibrary({ entities: [entityFile], outDir, splitFiles: false })).rejects.toThrow(
      /escapes output directory/
    );
  });

  const setupNamedEntity = async (entityName: string) => {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'rxdb-client-generator-build-edge-'));
    tempDirs.push(tempDir);
    const entityDir = path.join(tempDir, 'entities');
    const outDir = path.join(tempDir, 'generated');
    await mkdir(entityDir, { recursive: true });
    const entityFile = path.join(entityDir, 'entity.ts');
    await writeFile(
      entityFile,
      `
        import { Entity, EntityBase } from '@aiao/rxdb';
        @Entity({ name: '${entityName}', properties: [] })
        class ${entityName} extends EntityBase {}
      `,
      'utf8'
    );
    return { entityFile, outDir };
  };

  // split 模式的实体文件名直接取实体名，与固定的 barrel index.js/index.d.ts 无冲突检测：
  // 实体名 index 会被 barrel 整个覆盖，只剩一个自我导入的死循环模块。
  it('rejects an entity named index that would collide with the barrel', async () => {
    const { entityFile, outDir } = await setupNamedEntity('index');
    await expect(buildClientLibrary({ entities: [entityFile], outDir, splitFiles: true })).rejects.toThrow(
      /collides with the generated barrel/
    );
  });

  // macOS / Windows 文件系统大小写不敏感：Index.js 与 index.js 是同一个文件。
  // 精确大小写的 Set 检测不出覆盖，陈旧文件清理还会把刚写好的 index.js 删掉。
  it('rejects an entity whose file name collides case-insensitively with the barrel', async () => {
    const { entityFile, outDir } = await setupNamedEntity('Index');
    await expect(buildClientLibrary({ entities: [entityFile], outDir, splitFiles: true })).rejects.toThrow(
      /collides with the generated barrel/
    );
  });

  // 两个仅大小写不同的实体在大小写不敏感的 FS 上写同一个文件；精确大小写的去重放行了它。
  it('rejects two entities whose output files differ only by case', async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'rxdb-client-generator-build-edge-'));
    tempDirs.push(tempDir);
    const entityDir = path.join(tempDir, 'entities');
    const outDir = path.join(tempDir, 'generated');
    await mkdir(entityDir, { recursive: true });
    const entityFile = path.join(entityDir, 'entity.ts');
    await writeFile(
      entityFile,
      `
        import { Entity, EntityBase } from '@aiao/rxdb';
        @Entity({ name: 'Widget', properties: [] })
        class Widget extends EntityBase {}
        @Entity({ name: 'widget', properties: [] })
        class widget extends EntityBase {}
      `,
      'utf8'
    );

    await expect(buildClientLibrary({ entities: [entityFile], outDir, splitFiles: true })).rejects.toThrow(
      /colliding output/
    );
  });

  it('serializes concurrent builds for the same outDir', async () => {
    const { entityFile, outDir } = await setupEntity();
    await Promise.all([
      buildClientLibrary({ entities: [entityFile], outDir, splitFiles: false }),
      buildClientLibrary({ entities: [entityFile], outDir, splitFiles: false })
    ]);
    expect(await pathExists(path.join(outDir, 'index.js'))).toBe(true);
    const manifest = JSON.parse(await readFile(path.join(outDir, '.rxdb-client-generator-manifest.json'), 'utf8'));
    expect(manifest.version).toBe(1);
    expect(manifest.files).toEqual(expect.arrayContaining(['index.js', 'index.d.ts']));
  });
});
