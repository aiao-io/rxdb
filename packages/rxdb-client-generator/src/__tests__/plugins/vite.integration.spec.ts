import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, createServer, type ViteDevServer } from 'vite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { rxdbClientGeneratorVitePlugin } from '../../plugins/vite.js';

const rxdbEntry = fileURLToPath(new URL('../../../../rxdb/src/index.ts', import.meta.url));

const pathExists = async (filePath: string): Promise<boolean> => {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
};

const waitFor = async (assertion: () => Promise<void>, timeout = 30_000): Promise<void> => {
  const deadline = Date.now() + timeout;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      await assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
  }
  throw lastError;
};

const entitySource = (propertyName?: string): string => `
  import { Entity, PropertyType } from '@aiao/rxdb';

  @Entity({
    name: 'Widget',
    properties: [
      ${propertyName ? `{ name: '${propertyName}', type: PropertyType.string }` : ''}
    ]
  })
  export class Widget {}
`;

const createFixture = async (): Promise<{
  root: string;
  entityFile: string;
  generatedDeclaration: string;
}> => {
  const root = await mkdtemp(path.join(tmpdir(), 'rxdb-client-generator-vite-'));
  const entityDir = path.join(root, 'entities');
  const sourceDir = path.join(root, 'src');
  const generatedDir = path.join(sourceDir, 'generated');
  const entityFile = path.join(entityDir, 'Widget.ts');
  await Promise.all([mkdir(entityDir, { recursive: true }), mkdir(sourceDir, { recursive: true })]);
  await Promise.all([
    writeFile(entityFile, entitySource(), 'utf8'),
    writeFile(
      path.join(sourceDir, 'main.ts'),
      "import { ENTITIES } from './generated/index.js';\nexport const entityCount = ENTITIES.length;\n",
      'utf8'
    ),
    writeFile(path.join(root, 'index.html'), '<script type="module" src="/src/main.ts"></script>\n', 'utf8')
  ]);
  return {
    root,
    entityFile,
    generatedDeclaration: path.join(generatedDir, 'index.d.ts')
  };
};

describe('rxdbClientGeneratorVitePlugin integration', () => {
  const roots: string[] = [];
  const servers: ViteDevServer[] = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map(server => server.close()));
    await Promise.all(roots.splice(0).map(root => rm(root, { force: true, recursive: true })));
  });

  it('generates before a first build resolves generated imports', async () => {
    const fixture = await createFixture();
    roots.push(fixture.root);

    await build({
      configFile: false,
      root: fixture.root,
      logLevel: 'silent',
      resolve: { alias: { '@aiao/rxdb': rxdbEntry } },
      plugins: [
        rxdbClientGeneratorVitePlugin({
          entities: [fixture.entityFile],
          outDir: path.join(fixture.root, 'src/generated')
        })
      ],
      build: { outDir: path.join(fixture.root, 'dist') }
    });

    expect(await pathExists(fixture.generatedDeclaration)).toBe(true);
    expect(await pathExists(path.join(fixture.root, 'dist/index.html'))).toBe(true);
  });

  it('rebuilds serially on consecutive entity changes and triggers full reload', async () => {
    const fixture = await createFixture();
    roots.push(fixture.root);
    const server = await createServer({
      configFile: false,
      root: fixture.root,
      logLevel: 'silent',
      resolve: { alias: { '@aiao/rxdb': rxdbEntry } },
      plugins: [
        rxdbClientGeneratorVitePlugin({
          entities: [fixture.entityFile],
          outDir: path.join(fixture.root, 'src/generated')
        })
      ]
    });
    servers.push(server);
    await server.listen();
    const send = vi.spyOn(server.ws, 'send');

    expect(await readFile(fixture.generatedDeclaration, 'utf8')).not.toContain('title: string;');

    await writeFile(fixture.entityFile, entitySource('title'), 'utf8');
    await waitFor(async () => {
      expect(await readFile(fixture.generatedDeclaration, 'utf8')).toContain('title: string;');
    });

    await writeFile(fixture.entityFile, entitySource('name'), 'utf8');
    await waitFor(async () => {
      const declaration = await readFile(fixture.generatedDeclaration, 'utf8');
      expect(declaration).toContain('name: string;');
      expect(declaration).not.toContain('title: string;');
    });

    expect(send).toHaveBeenCalledWith({ type: 'full-reload' });
  });

  it('propagates initial generation failures from the Vite build', async () => {
    const fixture = await createFixture();
    roots.push(fixture.root);
    await writeFile(fixture.entityFile, '@Entity({ name: }) class Broken {}', 'utf8');

    await expect(
      build({
        configFile: false,
        root: fixture.root,
        logLevel: 'silent',
        plugins: [
          rxdbClientGeneratorVitePlugin({
            entities: [fixture.entityFile],
            outDir: path.join(fixture.root, 'src/generated')
          })
        ],
        build: { outDir: path.join(fixture.root, 'dist') }
      })
    ).rejects.toThrow();

    expect(await pathExists(path.join(fixture.root, 'dist/index.html'))).toBe(false);
  });
});
