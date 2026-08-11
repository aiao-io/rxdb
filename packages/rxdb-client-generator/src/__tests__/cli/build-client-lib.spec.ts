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

describe('buildClientLibrary output lifecycle', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })));
  });

  it('removes only stale manifest-owned files when output shape changes', async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'rxdb-client-generator-build-'));
    tempDirs.push(tempDir);
    const entityDir = path.join(tempDir, 'entities');
    const outDir = path.join(tempDir, 'generated');
    const entityFile = path.join(entityDir, 'User.ts');
    const sentinelFile = path.join(outDir, 'keep.txt');
    await mkdir(entityDir, { recursive: true });
    await writeFile(
      entityFile,
      `
        import { Entity } from '@aiao/rxdb';

        @Entity({ name: 'User', properties: [] })
        class User {}
      `,
      'utf8'
    );

    await buildClientLibrary({ entities: [entityFile], outDir, splitFiles: true });
    await writeFile(sentinelFile, 'keep', 'utf8');

    expect(await pathExists(path.join(outDir, 'User.js'))).toBe(true);
    expect(await pathExists(path.join(outDir, 'User.d.ts'))).toBe(true);

    await buildClientLibrary({ entities: [entityFile], outDir, splitFiles: false });

    expect(await pathExists(path.join(outDir, 'User.js'))).toBe(false);
    expect(await pathExists(path.join(outDir, 'User.d.ts'))).toBe(false);
    expect(await readFile(sentinelFile, 'utf8')).toBe('keep');
    expect(JSON.parse(await readFile(path.join(outDir, '.rxdb-client-generator-manifest.json'), 'utf8'))).toEqual({
      version: 1,
      files: ['index.d.ts', 'index.js']
    });
  });

  it('preserves handwritten getters in runtime and declaration outputs', async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'rxdb-client-generator-getter-'));
    tempDirs.push(tempDir);
    const entityDir = path.join(tempDir, 'entities');
    const outDir = path.join(tempDir, 'generated');
    const entityFile = path.join(entityDir, 'Document.ts');
    await mkdir(entityDir, { recursive: true });
    await writeFile(
      entityFile,
      `
        import { Entity, EntityBase, PropertyType } from '@aiao/rxdb';

        @Entity({
          name: 'Document',
          properties: [{ name: 'name', type: PropertyType.string }]
        })
        class Document extends EntityBase {
          name!: string;

          get normalizedName(): string {
            return this.name.trim().toLowerCase();
          }
        }
      `,
      'utf8'
    );

    await buildClientLibrary({ entities: [entityFile], outDir, splitFiles: true });

    expect(await readFile(path.join(outDir, 'Document.js'), 'utf8')).toContain('get normalizedName()');
    expect(await readFile(path.join(outDir, 'Document.d.ts'), 'utf8')).toContain('readonly normalizedName: string;');
  });

  it('rejects handwritten getters that collide with generated entity members', async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'rxdb-client-generator-getter-collision-'));
    tempDirs.push(tempDir);
    const entityDir = path.join(tempDir, 'entities');
    const outDir = path.join(tempDir, 'generated');
    const entityFile = path.join(entityDir, 'Document.ts');
    await mkdir(entityDir, { recursive: true });
    await writeFile(
      entityFile,
      `
        import { Entity, EntityBase, PropertyType } from '@aiao/rxdb';

        @Entity({
          name: 'Document',
          properties: [{ name: 'normalizedName', type: PropertyType.string }]
        })
        class Document extends EntityBase {
          get normalizedName(): string {
            return 'duplicate';
          }
        }
      `,
      'utf8'
    );

    await expect(buildClientLibrary({ entities: [entityFile], outDir, splitFiles: true })).rejects.toThrow(
      'Source getter Document.normalizedName collides with a generated entity member'
    );
  });

  it('preserves cross-file inheritance metadata regardless of entity input order', async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'rxdb-client-generator-inheritance-build-'));
    tempDirs.push(tempDir);
    const entityDir = path.join(tempDir, 'entities');
    const outDir = path.join(tempDir, 'generated');
    const baseFile = path.join(entityDir, 'Base.ts');
    const middleFile = path.join(entityDir, 'Middle.ts');
    const childFile = path.join(entityDir, 'Child.ts');
    await mkdir(entityDir, { recursive: true });
    await Promise.all([
      writeFile(
        baseFile,
        `
          import { Entity, EntityBase } from '@aiao/rxdb';
          @Entity({ name: 'Base', properties: [{ name: 'baseField', type: 'string' }] })
          export class Base extends EntityBase {}
        `,
        'utf8'
      ),
      writeFile(
        middleFile,
        `
          import { Entity } from '@aiao/rxdb';
          import { Base } from './Base.js';
          @Entity({ name: 'Middle', properties: [{ name: 'middleField', type: 'string' }] })
          export class Middle extends Base {}
        `,
        'utf8'
      ),
      writeFile(
        childFile,
        `
          import { Entity } from '@aiao/rxdb';
          import { Middle } from './Middle.js';
          @Entity({ name: 'Child', properties: [{ name: 'childField', type: 'string' }] })
          export class Child extends Middle {}
        `,
        'utf8'
      )
    ]);

    await buildClientLibrary({ entities: [childFile, middleFile, baseFile], outDir, splitFiles: true });

    const childDefinition = await readFile(path.join(outDir, 'Child.d.ts'), 'utf8');
    expect(childDefinition).toContain('baseField');
    expect(childDefinition).toContain('middleField');
    expect(childDefinition).toContain('childField');
    expect(childDefinition).toContain('class Child extends EntityBase');
  });

  it('keeps every generated entity when only part of the source switches to an import alias', async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'rxdb-client-generator-alias-build-'));
    tempDirs.push(tempDir);
    const entityDir = path.join(tempDir, 'entities');
    const outDir = path.join(tempDir, 'generated');
    const entityFile = path.join(entityDir, 'entities.ts');
    await mkdir(entityDir, { recursive: true });
    await writeFile(
      entityFile,
      `
        import { Entity } from '@aiao/rxdb';
        @Entity({ name: 'Direct', properties: [] })
        class Direct {}
        @Entity({ name: 'Aliased', properties: [] })
        class Aliased {}
      `,
      'utf8'
    );
    await buildClientLibrary({ entities: [entityFile], outDir, splitFiles: true });

    await writeFile(
      entityFile,
      `
        import { Entity, Entity as Model } from '@aiao/rxdb';
        @Entity({ name: 'Direct', properties: [] })
        class Direct {}
        @Model({ name: 'Aliased', properties: [] })
        class Aliased {}
      `,
      'utf8'
    );
    await buildClientLibrary({ entities: [entityFile], outDir, splitFiles: true });

    expect(await pathExists(path.join(outDir, 'Direct.d.ts'))).toBe(true);
    expect(await pathExists(path.join(outDir, 'Aliased.d.ts'))).toBe(true);
  });
});
