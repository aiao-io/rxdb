/**
 * `@aiao/rxdb-adapter-desktop` 消费者测试：验证发布 tarball 的**双入口**在临时 ESM
 * 消费者项目中可解析、可类型检查、可运行。
 *
 * @remarks
 * 本包是 monorepo 里唯一的双入口包（`.` 给 renderer，`./host` 给特权侧），
 * 因此除了常规的符号存在性之外，这里额外守两条 workspace 内测不到的性质：
 *
 * 1. **renderer 入口不得引用 `node:sqlite`。** `src/index.ts` 的 TSDoc 把「可以安全地
 *    打进 renderer bundle」写成了承诺，而 workspace 里的单测走 tsconfig paths 读源码，
 *    永远不会经过 rolldown 的 external / 入口切分——真出现串味只有在产物里才看得见。
 *    串味的后果不是构建报错而是安全退化：renderer bundle 里出现文件系统能力。
 * 2. **`./host` 真能打开数据库并跑出结果。** 只断言 `typeof === 'function'` 挡不住
 *    「导出在、但 `node:sqlite` 被 external 错了导致一调用就炸」这类产物级故障。
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
const packageName = '@aiao/rxdb-adapter-desktop';
// 必须覆盖被测包的**整个** `@aiao` 传递闭包，少一个就会从 registry 回落。
// `rxdb-test` 在列不是笔误：`@aiao/rxdb-adapter-sqlite-core` 把它声明成了运行时
// `dependencies` 而非 `devDependencies`，于是它是每个 sqlite-core 消费者的真实依赖。
// （这个声明本身值得单独复核，但那是包元数据问题，不归本脚本管。）
const packageDirectories = [
  'utils',
  'rxdb',
  'rxdb-test',
  'rxdb-adapter-encrypted',
  'rxdb-adapter-sqlite-core',
  'rxdb-adapter-desktop'
];

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
  assert.equal(tarballs.length, 1, `pnpm pack produced ${tarballs.length} new tarballs for ${packageDirectory}`);
  return path.join(destination, tarballs[0]);
};

const writeConsumer = async root => {
  const rendererSource = `
import {
  DESKTOP_ADAPTER_NAME,
  DESKTOP_DEFAULT_DATABASE_SUFFIX,
  DESKTOP_HOST_PROTOCOL_VERSION,
  DESKTOP_HOST_TRANSPORT_KEY,
  DesktopSqliteClient,
  RxDBAdapterDesktop,
  RxDBAdapterDesktopError,
  assertValidDesktopDatabaseName,
  resolveDesktopHostTransport,
  type DesktopHostTransport,
  type DesktopOptions,
  type DesktopSqliteFileStorage,
  type DesktopStorage
} from '${packageName}';

const storage: DesktopSqliteFileStorage = { engine: 'sqlite', databaseName: 'app.sqlite3' };
const anyStorage: DesktopStorage = storage;
const options: DesktopOptions = { transport: undefined as unknown as DesktopHostTransport };

void anyStorage;
void options;
void DESKTOP_ADAPTER_NAME;
void DESKTOP_DEFAULT_DATABASE_SUFFIX;
void DESKTOP_HOST_PROTOCOL_VERSION;
void DESKTOP_HOST_TRANSPORT_KEY;
void DesktopSqliteClient;
void RxDBAdapterDesktop;
void RxDBAdapterDesktopError;
void assertValidDesktopDatabaseName;
void resolveDesktopHostTransport;
`;
  await writeFile(path.join(root, 'consumer.ts'), rendererSource);

  const hostSource = `
import {
  DESKTOP_HOST_PROTOCOL_VERSION,
  NodeSqliteEngine,
  assertValidDesktopDatabaseName,
  createDesktopSqliteHost,
  parseDesktopHostRequest,
  type DesktopSqliteHost,
  type DesktopSqliteHostOptions
} from '${packageName}/host';

const options: DesktopSqliteHostOptions = {
  resolveDatabasePath: name => name,
  postChange: () => undefined
};
const host: DesktopSqliteHost = createDesktopSqliteHost(options);

void host;
void DESKTOP_HOST_PROTOCOL_VERSION;
void NodeSqliteEngine;
void assertValidDesktopDatabaseName;
void parseDesktopHostRequest;
`;
  await writeFile(path.join(root, 'consumer-host.ts'), hostSource);
};

const writeRuntime = async root => {
  const source = `
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import * as renderer from '${packageName}';
import * as host from '${packageName}/host';

const require = createRequire(import.meta.url);

for (const name of [
  'DesktopSqliteClient',
  'RxDBAdapterDesktop',
  'RxDBAdapterDesktopError',
  'assertDesktopHostResponse',
  'assertValidDesktopDatabaseName',
  'resolveDesktopHostTransport'
]) {
  assert.equal(typeof renderer[name], 'function', 'renderer entry is missing ' + name);
}
assert.equal(typeof renderer.DESKTOP_ADAPTER_NAME, 'string');
assert.equal(typeof renderer.DESKTOP_HOST_PROTOCOL_VERSION, 'number');

for (const name of ['createDesktopSqliteHost', 'NodeSqliteEngine', 'parseDesktopHostRequest', 'assertValidDesktopDatabaseName']) {
  assert.equal(typeof host[name], 'function', 'host entry is missing ' + name);
}

// 双入口报同一个协议版本，否则 renderer 和 host 会在握手时各说各话。
assert.equal(renderer.DESKTOP_HOST_PROTOCOL_VERSION, host.DESKTOP_HOST_PROTOCOL_VERSION);

// renderer 入口不得把特权侧代码带进来 —— 见本脚本头部第 1 条。
const rendererEntry = require.resolve('${packageName}');
const rendererCode = await readFile(rendererEntry, 'utf8');
assert.ok(
  !/["'\\\`]node:sqlite["'\\\`]/.test(rendererCode),
  'renderer entry references node:sqlite; it can no longer be bundled into a renderer safely'
);

// host 入口真的能开库、建表、读回来。
const workspaceDir = await mkdtemp(path.join(tmpdir(), 'desktop-consumer-db-'));
try {
  const sqliteHost = host.createDesktopSqliteHost({
    resolveDatabasePath: databaseName => path.join(workspaceDir, databaseName),
    postChange: () => undefined
  });

  // 应答一律经 renderer 入口的 assertDesktopHostResponse 解包：这样这段往返同时
  // 证明了两个入口的协议是配套的，而不只是各自都能加载。
  const { assertDesktopHostResponse } = renderer;

  const opened = assertDesktopHostResponse(
    'open',
    await sqliteHost.handle({ kind: 'open', storage: { engine: 'sqlite', databaseName: 'consumer.sqlite3' } })
  );
  assert.equal(opened.result.protocolVersion, host.DESKTOP_HOST_PROTOCOL_VERSION);

  const { sessionId } = opened.result;
  const execute = (sql, bindings) => sqliteHost.handle({ kind: 'execute', sessionId, sql, bindings });

  assertDesktopHostResponse('execute', await execute('CREATE TABLE probe (id INTEGER PRIMARY KEY, label TEXT NOT NULL);', []));
  assertDesktopHostResponse('execute', await execute('INSERT INTO probe (id, label) VALUES (?, ?);', [1, 'ok']));
  const selected = assertDesktopHostResponse('execute', await execute('SELECT label FROM probe WHERE id = ?;', [1]));
  assert.ok(
    JSON.stringify(selected.result).includes('ok'),
    'round-trip lost the inserted row: ' + JSON.stringify(selected.result)
  );

  // 名字白名单在产物里依然生效（路径穿越防线）。
  assert.throws(() => host.assertValidDesktopDatabaseName('../escape.sqlite3'));

  assertDesktopHostResponse('close', await sqliteHost.handle({ kind: 'close', sessionId }));
  assert.equal(sqliteHost.openSessionCount, 0);
  sqliteHost.closeAll();
} finally {
  await rm(workspaceDir, { force: true, recursive: true });
}
`;
  await writeFile(path.join(root, 'runtime.mjs'), source);
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
    files: ['./consumer.ts', './consumer-host.ts']
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

const root = await mkdtemp(path.join(tmpdir(), 'rxdb-adapter-desktop-consumer-'));
const tarballs = await mkdtemp(path.join(tmpdir(), 'rxdb-adapter-desktop-pack-'));
try {
  const packed = new Map();
  for (const directory of packageDirectories) {
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
    packageDirectories.map(directory => [`@aiao/${directory}`, `file:${packed.get(directory)}`])
  );

  const packageJson = {
    name: 'rxdb-adapter-desktop-consumer',
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
  await writeRuntime(root);

  const tscPath = path.join(workspaceRoot, 'node_modules/typescript/bin/tsc');
  await run(process.execPath, [tscPath, '--project', 'tsconfig.json', '--pretty', 'false'], root);
  await run(process.execPath, [tscPath, '--project', 'tsconfig.bundler.json', '--pretty', 'false'], root);
  await run(process.execPath, ['runtime.mjs'], root);
  process.stdout.write(`Published consumer passed: ${packageName} dual entry, NodeNext + Bundler + host round-trip.\n`);
} finally {
  await rm(root, { force: true, recursive: true });
  await rm(tarballs, { force: true, recursive: true });
}
