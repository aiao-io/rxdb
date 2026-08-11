import { execFile } from 'node:child_process';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const packageRoot = path.resolve(import.meta.dirname, '..');
const workspaceRoot = path.resolve(packageRoot, '../..');
const tscPath = path.join(workspaceRoot, 'node_modules/typescript/bin/tsc');

const run = async (command, args, cwd, forwardOutput = true) => {
  const { stdout, stderr } = await execFileAsync(command, args, {
    cwd,
    maxBuffer: 16 * 1024 * 1024
  });
  if (forwardOutput) {
    process.stdout.write(stdout);
    process.stderr.write(stderr);
  }
};

const pack = async (packageDirectory, destination) => {
  const previous = new Set(await readdir(destination));
  await run('pnpm', ['pack', '--pack-destination', destination, '--silent'], packageDirectory, false);
  const tarballs = (await readdir(destination)).filter(entry => entry.endsWith('.tgz') && !previous.has(entry));
  if (tarballs.length !== 1) {
    throw new Error(`pnpm pack produced ${tarballs.length} new tarballs for ${packageDirectory}`);
  }
  return path.join(destination, tarballs[0]);
};

const writeRunner = async root => {
  const runner = String.raw`
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PropertyType, RelationKind } from '@aiao/rxdb';
import { RxDBClientGenerator } from '@aiao/rxdb-client-generator';
import { isCliEntry } from '@aiao/rxdb-client-generator/cli';
import { rxdbClientGeneratorVitePlugin } from '@aiao/rxdb-client-generator/vite';

if (isCliEntry(import.meta.url, undefined) || rxdbClientGeneratorVitePlugin({ entities: [], outDir: './unused' }).name !== 'rxdb-client-generator-vite-plugin') {
  throw new Error('Published CLI or Vite subpath export is not usable');
}

const outputRoot = path.join(process.cwd(), 'generated');
const baseEntity = (name, overrides = {}) => ({
  name,
  namespace: 'public',
  repository: 'Repository',
  extends: ['EntityBase'],
  properties: [{ name: 'id', type: PropertyType.uuid, nullable: false, readonly: true }],
  computedProperties: [],
  relations: [],
  indexes: [],
  ...overrides
});

const writeShape = async (name, options, entities) => {
  const generator = new RxDBClientGenerator(options);
  entities.forEach(entity => generator.addEntity(entity));
  generator.exec();
  const destination = path.join(outputRoot, name);
  for (const sourceFile of generator.getSourceFiles()) {
    const target = path.join(destination, sourceFile.getFilePath());
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, sourceFile.getText());
  }
};

await writeShape('single', {}, [baseEntity('User', {
  properties: [
    ...baseEntity('User').properties,
    { name: 'name', type: PropertyType.string, nullable: false, readonly: false }
  ]
})]);

await writeShape('split', { splitFiles: true }, [baseEntity('SplitUser'), baseEntity('SplitPost')]);

await writeShape('tree', {}, [baseEntity('Category', { extends: ['TreeEntityBase'] })]);

await writeShape('key-value', {}, [baseEntity('Config', {
  properties: [
    ...baseEntity('Config').properties,
    {
      name: 'options',
      type: PropertyType.keyValue,
      nullable: false,
      readonly: false,
      properties: [{ name: 'timeout', type: PropertyType.number, nullable: false }]
    }
  ]
})]);

await writeShape('relations', {}, [
  baseEntity('Author', {
    relations: [{
      name: 'posts',
      kind: RelationKind.ONE_TO_MANY,
      mappedEntity: 'Post',
      mappedNamespace: 'public',
      mappedProperty: 'author'
    }]
  }),
  baseEntity('Post', {
    relations: [{
      name: 'author',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'Author',
      mappedNamespace: 'public',
      mappedProperty: 'posts',
      nullable: false
    }]
  })
]);
`;
  await writeFile(path.join(root, 'runner.mjs'), runner);
};

const writeConsumer = async root => {
  const consumer = String.raw`
import { NAMESPACE_PUBLIC, RxDBClientGenerator } from '@aiao/rxdb-client-generator';
import { ENTITIES as single } from './generated/single/index.js';
import { ENTITIES as split } from './generated/split/index.js';
import { ENTITIES as tree } from './generated/tree/index.js';
import { ENTITIES as keyValue } from './generated/key-value/index.js';
import { ENTITIES as relations } from './generated/relations/index.js';

const all = [single, split, tree, keyValue, relations];
if (NAMESPACE_PUBLIC !== 'public' || all.some(entities => !Array.isArray(entities) || entities.length === 0)) {
  throw new Error('Generated runtime exports are not usable');
}
const generator = new RxDBClientGenerator();
if (generator.config.relationQueryDeep !== 3) {
  throw new Error('Published generator runtime is not usable');
}
`;
  await writeFile(path.join(root, 'consumer.ts'), consumer);
};

const writeTsconfig = async root => {
  await writeFile(
    path.join(root, 'tsconfig.json'),
    JSON.stringify(
      {
        compilerOptions: {
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          target: 'ES2022',
          strict: true,
          noEmit: true,
          skipLibCheck: false,
          types: []
        },
        files: ['./consumer.ts']
      },
      null,
      2
    )
  );
  await writeFile(
    path.join(root, 'tsconfig.bundler.json'),
    JSON.stringify(
      {
        extends: './tsconfig.json',
        compilerOptions: { module: 'ESNext', moduleResolution: 'Bundler' }
      },
      null,
      2
    )
  );
};

const main = async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'rxdb-client-generator-consumer-'));
  const tarballs = await mkdtemp(path.join(tmpdir(), 'rxdb-client-generator-pack-'));
  try {
    const rxdbTarball = await pack(path.join(workspaceRoot, 'packages/rxdb'), tarballs);
    const generatorTarball = await pack(packageRoot, tarballs);
    const utilsTarball = await pack(path.join(workspaceRoot, 'packages/utils'), tarballs);
    const packageJson = {
      name: 'rxdb-client-generator-consumer',
      private: true,
      type: 'module',
      dependencies: {
        '@aiao/rxdb': `file:${rxdbTarball}`,
        '@aiao/rxdb-client-generator': `file:${generatorTarball}`,
        '@aiao/utils': `file:${utilsTarball}`
      }
    };
    await writeFile(path.join(root, 'package.json'), JSON.stringify(packageJson, null, 2));
    await writeFile(path.join(root, '.npmrc'), 'node-linker=hoisted\n');
    await run('pnpm', ['install', '--prefer-offline', '--ignore-scripts', '--no-frozen-lockfile'], root);
    await writeRunner(root);
    await run(process.execPath, ['runner.mjs'], root);
    await writeConsumer(root);
    await writeTsconfig(root);
    await run(process.execPath, [tscPath, '--project', 'tsconfig.json', '--pretty', 'false'], root);
    await run(process.execPath, [tscPath, '--project', 'tsconfig.bundler.json', '--pretty', 'false'], root);
    process.stdout.write('Published consumer gate passed: NodeNext + Bundler, runtime imports passed.\n');
  } finally {
    await rm(root, { force: true, recursive: true });
    await rm(tarballs, { force: true, recursive: true });
  }
};

await main();
