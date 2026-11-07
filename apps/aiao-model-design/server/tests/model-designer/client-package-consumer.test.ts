// @vitest-environment node
import { PropertyType } from '@aiao/rxdb';
import { RxDBClientGenerator } from '@aiao/rxdb-client-generator';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createClientPackageService } from '../../src/routes/model-designer/client-package/service';

const temporaryRoots: string[] = [];

async function run(command: string[], cwd: string): Promise<{ exitCode: number; stderr: string }> {
  const [executable, ...args] = command;
  if (!executable) throw new Error('Missing executable');
  const child = spawn(executable, args, {
    cwd,
    env: {
      ...process.env,
      npm_config_cache: resolve(cwd, '.npm-cache'),
      npm_config_logs_dir: resolve(cwd, '.npm-logs')
    },
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  let stderr = '';
  child.stdout.on('data', (chunk: string) => (stderr += chunk));
  child.stderr.on('data', (chunk: string) => (stderr += chunk));
  const exitCode = await new Promise<number>(resolve => child.once('close', code => resolve(code ?? -1)));
  return { exitCode, stderr };
}

describe('client package real consumer', () => {
  afterEach(async () => {
    await Promise.all(temporaryRoots.splice(0).map(path => rm(path, { recursive: true, force: true })));
  });

  it('packs, installs, type-checks, and instantiates a three-entity client', async () => {
    const generator = new RxDBClientGenerator();
    for (const name of ['User', 'Post', 'Comment'] as const) {
      generator.addEntity({
        name,
        extends: ['EntityBase'],
        repository: 'Repository',
        properties: [{ name: 'title', type: PropertyType.string }]
      });
    }
    generator.exec();

    const service = createClientPackageService();
    const archive = await service.archive({
      packageName: '@acme/blog-rxdb',
      generatedFiles: generator.getSourceFiles().map(file => ({ path: file.getFilePath(), content: file.getText() })),
      designContract: {
        entities: ['User', 'Post', 'Comment'].map(name => ({
          name,
          properties: [{ name: 'title', type: 'string' }],
          relations: []
        })),
        metadata: { designName: 'Blog' }
      }
    });

    const workspaceRoot = resolve(process.cwd(), '../..');
    const root = await mkdtemp(resolve(workspaceRoot, 'tmp/client-package-consumer-'));
    temporaryRoots.push(root);
    const consumer = resolve(root, 'consumer');
    await mkdir(consumer);
    const tarball = resolve(root, archive.filename);
    await writeFile(tarball, archive.bytes);
    await writeFile(resolve(consumer, 'package.json'), '{"name":"consumer","private":true,"type":"module"}\n');
    await writeFile(
      resolve(consumer, 'consumer.ts'),
      "import { Post } from '@acme/blog-rxdb';\nimport { RxDB, SyncType } from '@aiao/rxdb';\nimport { RxDBAdapterSqlite } from '@aiao/rxdb-adapter-sqlite';\nconst rxdb = new RxDB({ dbName: 'consumer', entities: [Post], sync: { type: SyncType.None, local: { adapter: 'sqlite' } } });\nrxdb.adapter('sqlite', db => new RxDBAdapterSqlite(db, { opfsFallback: 'memory' }));\nrxdb.init();\nconst post = new Post({ title: 'hello' });\nif (post.title !== 'hello') throw new Error('bad entity');\nawait rxdb.disconnectAll();\n"
    );

    const installed = await run(
      ['npm', 'install', tarball, '--ignore-scripts', '--legacy-peer-deps', '--offline', '--no-package-lock'],
      consumer
    );
    expect(installed.exitCode, installed.stderr).toBe(0);
    const checked = await run(
      [
        resolve(workspaceRoot, 'node_modules/.bin/tsc'),
        '--ignoreConfig',
        '--noEmit',
        '--module',
        'nodenext',
        '--moduleResolution',
        'nodenext',
        '--target',
        'es2022',
        '--skipLibCheck',
        'consumer.ts'
      ],
      consumer
    );
    expect(checked.exitCode, checked.stderr).toBe(0);
    const executed = await run(['bun', 'consumer.ts'], consumer);
    expect(executed.exitCode, executed.stderr).toBe(0);
  }, 120_000);
});
