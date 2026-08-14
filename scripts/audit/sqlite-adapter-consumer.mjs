/**
 * SQLite 适配器消费者测试：验证适配器在临时 ESM 消费者项目中的运行时行为。
 *
 * 用法: node scripts/audit/sqlite-adapter-consumer.mjs <adapter-directory>
 */

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const workspaceRoot = process.cwd();
const workspacePackageJson = JSON.parse(await readFile(path.join(workspaceRoot, 'package.json'), 'utf8'));
const adapterDirectory = process.argv[2];
const contracts = {
  'rxdb-adapter-sqlite': {
    packageName: '@aiao/rxdb-adapter-sqlite',
    adapter: 'RxDBAdapterSqlite',
    client: 'SqliteClient',
    load: 'sqliteLoad',
    loadOptions: 'SqliteLoadOptions',
    options: 'SqliteOptions',
    repository: 'SqliteRepositoryConstructor'
  },
  'rxdb-adapter-sqliteai': {
    packageName: '@aiao/rxdb-adapter-sqliteai',
    adapter: 'RxDBAdapterSqliteai',
    client: 'SqliteaiClient',
    load: 'sqliteaiLoad',
    loadOptions: 'SqliteaiLoadOptions',
    options: 'SqliteaiOptions',
    repository: 'SqliteaiRepositoryConstructor'
  }
};
const contract = contracts[adapterDirectory];

assert.ok(contract, `Unknown sqlite adapter: ${adapterDirectory}`);

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

const writeConsumer = async root => {
  const source = `
import {
  BATCH_TIMEOUT,
  ${contract.adapter},
  ${contract.client},
  createSqliteClient,
  ${contract.load},
  type ${contract.loadOptions},
  type ${contract.options},
  type ${contract.repository}
} from '${contract.packageName}';

const loadOptions: ${contract.loadOptions} = { batchTimeout: BATCH_TIMEOUT.BALANCED };
const adapterOptions: ${contract.options} = { ...loadOptions };
type RepositoryConstructor = ${contract.repository}<never>;

void adapterOptions;
void (undefined as RepositoryConstructor | undefined);
void ${contract.adapter};
void ${contract.client};
void createSqliteClient;
void ${contract.load};
`;
  await writeFile(path.join(root, 'consumer.ts'), source);

  const runtime = `
import {
  BATCH_TIMEOUT,
  ${contract.adapter},
  ${contract.client},
  createSqliteClient,
  ${contract.load}
} from '${contract.packageName}';

if (
  BATCH_TIMEOUT.BALANCED !== 16 ||
  typeof ${contract.adapter} !== 'function' ||
  typeof ${contract.client} !== 'function' ||
  typeof createSqliteClient !== 'function' ||
  typeof ${contract.load} !== 'function'
) {
  throw new Error('Published sqlite adapter root contract is not usable');
}
`;
  await writeFile(path.join(root, 'runtime.mjs'), runtime);
};

const writeTsconfig = async root => {
  const base = {
    compilerOptions: {
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      target: 'ES2022',
      strict: true,
      noEmit: true,
      skipLibCheck: false,
      types: ['node']
    },
    files: ['./consumer.ts']
  };
  await writeFile(path.join(root, 'tsconfig.json'), JSON.stringify(base, null, 2));
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

const root = await mkdtemp(path.join(tmpdir(), `${adapterDirectory}-consumer-`));
const tarballs = await mkdtemp(path.join(tmpdir(), `${adapterDirectory}-pack-`));
try {
  // 必须覆盖被测包的**整个** `@aiao` 传递闭包，少一个就会从 registry 回落。
  // `rxdb-test` 在列不是笔误：`@aiao/rxdb-adapter-sqlite-core` 把它声明成了运行时
  // `dependencies` 而非 `devDependencies`，于是它是每个 sqlite-core 消费者的真实依赖。
  // （这个声明本身值得单独复核，但那是包元数据问题，不归本脚本管。）
  const directories = [
    'utils',
    'rxdb',
    'rxdb-test',
    'rxdb-adapter-encrypted',
    'rxdb-adapter-sqlite-core',
    adapterDirectory
  ];
  const packed = new Map();
  for (const directory of directories) {
    packed.set(directory, await pack(path.join(workspaceRoot, 'packages', directory), tarballs));
  }

  // 每个 `@aiao/*` 都必须**同时**出现在 dependencies 和 pnpm.overrides 里，缺一不可：
  //
  // - 只给 dependencies 不够：tarball 内部的依赖按 semver 从 registry 解析，不会与
  //   根上的 `file:` 去重。
  // - 只给 overrides 不够：peerDependency 会被 pnpm 的 auto-install-peers 当作根项目的
  //   直接依赖注入，绕过 overrides。
  //
  // 两者都缺时的表现极具迷惑性：只要 registry 上**恰好**有同号版本，安装就成功，
  // 但被测的其实是 npm 上那份旧代码，不是本地产物 —— 门禁看着绿，实际什么也没验。
  // 这个坑是 2026-08-14 把版本抬到未发布的 0.0.25 时才炸出来的。
  const localOverrides = Object.fromEntries(
    directories.map(directory => [
      directory === adapterDirectory ? contract.packageName : `@aiao/${directory}`,
      `file:${packed.get(directory)}`
    ])
  );

  const packageJson = {
    name: `${adapterDirectory}-consumer`,
    private: true,
    type: 'module',
    dependencies: localOverrides,
    pnpm: {
      overrides: localOverrides
    },
    devDependencies: {
      '@types/ms': workspacePackageJson.devDependencies['@types/ms'],
      '@types/node': workspacePackageJson.devDependencies['@types/node']
    }
  };
  await writeFile(path.join(root, 'package.json'), JSON.stringify(packageJson, null, 2));
  await writeFile(path.join(root, '.npmrc'), 'node-linker=hoisted\n');
  await run('pnpm', ['install', '--prefer-offline', '--ignore-scripts', '--no-frozen-lockfile'], root);
  await writeConsumer(root);
  await writeTsconfig(root);

  const tscPath = path.join(workspaceRoot, 'node_modules/typescript/bin/tsc');
  await run(process.execPath, [tscPath, '--project', 'tsconfig.json', '--pretty', 'false'], root);
  await run(process.execPath, [tscPath, '--project', 'tsconfig.bundler.json', '--pretty', 'false'], root);
  await run(process.execPath, ['runtime.mjs'], root);
  process.stdout.write(`Published consumer passed: ${contract.packageName}, NodeNext + Bundler + runtime.\n`);
} finally {
  await rm(root, { force: true, recursive: true });
  await rm(tarballs, { force: true, recursive: true });
}
