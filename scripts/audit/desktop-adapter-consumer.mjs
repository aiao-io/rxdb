/**
 * 桌面适配器的**消费者测试**：验证 `@aiao/rxdb-adapter-electron` 与
 * `@aiao/rxdb-adapter-tauri` 的发布 tarball 在临时 ESM 消费者项目中
 * 可解析、可类型检查、可运行。
 *
 * @remarks
 * 两个包由同一份脚本参数化跑（US-207 E7），**不复制第二份脚本**：它们守的是同一组
 * 性质，抄一份出来只会让两边的判据各自漂移。差异集中在 {@link TARGETS} 一张表里。
 *
 * 守的是三条 workspace 内测不到的性质：
 *
 * 1. **renderer 入口的产物依赖图里不得出现 Node 内建。** 两个包的 `src/index.ts` 都把
 *    「可以安全地打进 renderer bundle」写成了 TSDoc 承诺，而 workspace 里的单测走
 *    tsconfig paths 读源码，永远不会经过 rolldown 的 external / 入口切分——真出现串味
 *    只有在产物里才看得见。串味的后果不是构建报错而是安全退化：renderer bundle 里
 *    出现文件系统能力。
 *
 *    US-207 E1 之后这条必须**跟着依赖图走**，只读入口那一个文件已经不够：协议层搬去了
 *    `@aiao/rxdb-adapter-sqlite-core/desktop-host`，被 external 出去，两个包的 `dist/index.js`
 *    如今基本只是一层转出壳子——串味会发生在壳子后面。
 * 2. **`./host` 真能打开数据库并跑出结果。** 只断言 `typeof === 'function'` 挡不住
 *    「导出在、但 `node:sqlite` 被 external 错了导致一调用就炸」这类产物级故障。
 *    只有 Electron 有这一条：Tauri 的特权侧是 Rust，随应用二进制走，不经 npm 分发，
 *    因而没有第二个入口可验（它的对应保障是 `conformance/` 那套跨进程一致性套件）。
 * 3. **NodeNext 与 Bundler 两种解析下都能类型检查。** 桌面应用两种打包姿势都有人用，
 *    `exports` 字段写错时往往只在其中一种下才炸。
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

/**
 * 两个桌面运行时包共享的依赖闭包。顺序即 `pnpm pack` 顺序，与依赖方向一致。
 */
const SHARED_PACKAGE_DIRECTORIES = ['utils', 'rxdb', 'rxdb-adapter-encrypted', 'rxdb-adapter-sqlite-core'];

/**
 * 两个包的差异全在这里。新增桌面运行时（US-208 的 `pglite-electron` 等）只加一项，
 * 下面的流程一个字都不用改。
 */
const TARGETS = [
  {
    directory: 'rxdb-adapter-electron',
    packageName: '@aiao/rxdb-adapter-electron',
    // 名字带引擎与运行时两段：同一个运行时上还会有别的引擎（US-208 的 `pglite-electron`）。
    adapterNameExport: 'ELECTRON_ADAPTER_NAME',
    adapterName: 'sqlite-electron',
    adapterClass: 'RxDBAdapterElectron',
    extraValueExports: [],
    extraTypeExports: [],
    // 特权侧也是 TypeScript，经 `./host` 子路径分发。
    hasHostEntry: true
  },
  {
    directory: 'rxdb-adapter-tauri',
    packageName: '@aiao/rxdb-adapter-tauri',
    adapterNameExport: 'TAURI_ADAPTER_NAME',
    adapterName: 'sqlite-tauri',
    adapterClass: 'RxDBAdapterTauri',
    extraValueExports: [
      'TAURI_DESKTOP_CHANGE_EVENT',
      'TAURI_DESKTOP_REQUEST_COMMAND',
      'createTauriHostTransport',
      'decodeDesktopJsonPayload',
      'encodeDesktopJsonPayload'
    ],
    extraTypeExports: ['TauriHostTransportOptions', 'TauriOptions'],
    hasHostEntry: false
  }
];

/** renderer 入口上两个包共有的值导出。 */
const SHARED_VALUE_EXPORTS = [
  'DESKTOP_DEFAULT_DATABASE_SUFFIX',
  'DESKTOP_HOST_PROTOCOL_VERSION',
  'DESKTOP_HOST_TRANSPORT_KEY',
  'DesktopSqliteClient',
  'RxDBAdapterDesktopError',
  'assertDesktopHostResponse',
  'assertValidDesktopDatabaseName',
  'resolveDesktopHostTransport'
];

/** renderer 入口上两个包共有的类型导出。 */
const SHARED_TYPE_EXPORTS = ['DesktopHostTransport', 'DesktopOptions', 'DesktopSqliteFileStorage', 'DesktopStorage'];

/** renderer 入口里必须是函数的导出（`typeof === 'function'`）。 */
const RENDERER_CALLABLE_EXPORTS = [
  'DesktopSqliteClient',
  'RxDBAdapterDesktopError',
  'assertDesktopHostResponse',
  'assertValidDesktopDatabaseName',
  'resolveDesktopHostTransport'
];

/**
 * 跑一条子命令；失败时**一定**把两个流都转出去。
 *
 * @remarks
 * `execFile` 的拒绝理由只有一行 `Command failed: <cmd>` 外加 stderr，而 `tsc` 把诊断写在
 * **stdout** 上——不显式转发的话，这道门禁在 CI 上失败时只留下一行「命令失败了」，
 * 具体哪个导出、哪种解析模式炸的全部丢失，而这正是本脚本存在的全部意义。
 *
 * 失败路径不看 `forwardOutput`：那个开关是用来压掉 `pnpm pack` 成功时的正常噪声的，
 * 而失败时的输出恰恰是唯一的线索。
 */
const run = async (command, args, cwd, forwardOutput = true) => {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd,
      maxBuffer: 16 * 1024 * 1024
    });
    if (forwardOutput) {
      process.stdout.write(stdout);
      process.stderr.write(stderr);
    }
  } catch (error) {
    // 进程根本没起来（ENOENT）时这两个字段是 undefined，与「起来了但没输出」一样按空串处理。
    process.stdout.write(error.stdout ?? '');
    process.stderr.write(error.stderr ?? '');
    throw error;
  }
};

const pack = async (packageDirectory, destination) => {
  const previous = new Set(await readdir(destination));
  await run('pnpm', ['pack', '--pack-destination', destination, '--silent'], packageDirectory, false);
  const tarballs = (await readdir(destination)).filter(entry => entry.endsWith('.tgz') && !previous.has(entry));
  assert.equal(tarballs.length, 1, `pnpm pack produced ${tarballs.length} new tarballs for ${packageDirectory}`);
  return path.join(destination, tarballs[0]);
};

const writeConsumer = async (root, target) => {
  const values = [...SHARED_VALUE_EXPORTS, target.adapterNameExport, target.adapterClass, ...target.extraValueExports];
  const types = [...SHARED_TYPE_EXPORTS, ...target.extraTypeExports];
  const bindings = [...values.toSorted(), ...types.toSorted().map(name => `type ${name}`)];

  // 类型位置上真用一遍，而不只是 `void X`：`exports` 的 `types` 指错时，
  // 单纯的重导出往往还能过，落到具体类型标注上才炸。
  const rendererSource = `
import {
${bindings.map(binding => `  ${binding}`).join(',\n')}
} from '${target.packageName}';

const storage: DesktopSqliteFileStorage = { engine: 'sqlite', databaseName: 'app.sqlite3' };
const anyStorage: DesktopStorage = storage;
const options: DesktopOptions = { transport: undefined as unknown as DesktopHostTransport };

void anyStorage;
void options;
${values
  .toSorted()
  .map(name => `void ${name};`)
  .join('\n')}
`;
  await writeFile(path.join(root, 'consumer.ts'), rendererSource);

  if (!target.hasHostEntry) return ['./consumer.ts'];

  const hostSource = `
import {
  DESKTOP_HOST_PROTOCOL_VERSION,
  NodeSqliteEngine,
  assertValidDesktopDatabaseName,
  createElectronSqliteHost,
  parseDesktopHostRequest,
  type ElectronSqliteHost,
  type ElectronSqliteHostOptions
} from '${target.packageName}/host';

const options: ElectronSqliteHostOptions = {
  resolveDatabasePath: name => name,
  postChange: () => undefined
};
const host: ElectronSqliteHost = createElectronSqliteHost(options);

void host;
void DESKTOP_HOST_PROTOCOL_VERSION;
void NodeSqliteEngine;
void assertValidDesktopDatabaseName;
void parseDesktopHostRequest;
`;
  await writeFile(path.join(root, 'consumer-host.ts'), hostSource);
  return ['./consumer.ts', './consumer-host.ts'];
};

/**
 * 性质 2 的正文：只有带 `./host` 的包才写进 runtime。
 */
const hostRoundTripSource = packageName => `
import * as host from '${packageName}/host';

for (const name of ['createElectronSqliteHost', 'NodeSqliteEngine', 'parseDesktopHostRequest', 'assertValidDesktopDatabaseName']) {
  assert.equal(typeof host[name], 'function', 'host entry is missing ' + name);
}

// 双入口报同一个协议版本，否则 renderer 和 host 会在握手时各说各话。
assert.equal(renderer.DESKTOP_HOST_PROTOCOL_VERSION, host.DESKTOP_HOST_PROTOCOL_VERSION);

// host 入口真的能开库、建表、读回来。
const workspaceDir = await mkdtemp(path.join(tmpdir(), 'desktop-consumer-db-'));
try {
  const sqliteHost = host.createElectronSqliteHost({
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

const writeRuntime = async (root, target) => {
  const source = `
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import * as renderer from '${target.packageName}';

const require = createRequire(import.meta.url);

for (const name of ${JSON.stringify(RENDERER_CALLABLE_EXPORTS)}) {
  assert.equal(typeof renderer[name], 'function', 'renderer entry is missing ' + name);
}
assert.equal(typeof renderer.${target.adapterClass}, 'function', 'renderer entry is missing ${target.adapterClass}');
assert.equal(typeof renderer.DESKTOP_HOST_PROTOCOL_VERSION, 'number');

// 适配器名在产物里也必须是拆分后的那一个：US-504 AC#9 的 adapter_mismatch 判定按名字走，
// 名字漂了，插件侧只会静默地不再匹配。
assert.equal(renderer.${target.adapterNameExport}, '${target.adapterName}');

// ---------------------------------------------------------------------------
// 性质 1：renderer 入口的**依赖图**里不得出现 Node 内建 —— 见本脚本头部第 1 条。
//
// 只走 @aiao/ 范围内的文件：外部依赖（rxjs 等）不是本仓库能改的东西，把它们扫进来
// 只会让这条门禁报出无人能修的红。
// ---------------------------------------------------------------------------
const IMPORT_PATTERN = /(?:from|import)\\s*\\(?\\s*['"]([^'"]+)['"]/g;

const collectGraph = async entry => {
  const seen = new Set();
  const builtins = new Map();
  const queue = [entry];
  while (queue.length > 0) {
    const current = queue.pop();
    if (seen.has(current)) continue;
    seen.add(current);
    const code = await readFile(current, 'utf8');
    const localRequire = createRequire(pathToFileURL(current));
    for (const [, specifier] of code.matchAll(IMPORT_PATTERN)) {
      if (specifier.startsWith('node:')) {
        builtins.set(specifier, current);
        continue;
      }
      let resolved;
      try {
        resolved = localRequire.resolve(specifier);
      } catch {
        continue;
      }
      if (resolved.includes(path.join('node_modules', '@aiao')) || resolved.startsWith(path.dirname(entry))) {
        queue.push(resolved);
      }
    }
  }
  return { files: seen, builtins };
};

const rendererEntry = require.resolve('${target.packageName}');
const { files, builtins } = await collectGraph(rendererEntry);
assert.ok(files.size > 0, 'renderer graph walk visited no files; the walker is broken, not the package');

// \`node:sqlite\` 单独点名：它是这条门禁最初要拦的东西，混在通用报错里不好认。
assert.ok(
  !builtins.has('node:sqlite'),
  'renderer graph references node:sqlite (via ' + builtins.get('node:sqlite') + '); it can no longer be bundled into a renderer safely'
);
assert.equal(
  builtins.size,
  0,
  'renderer graph references Node builtins: ' +
    [...builtins].map(([specifier, file]) => specifier + ' <- ' + file).join(', ')
);
${target.hasHostEntry ? hostRoundTripSource(target.packageName) : ''}
`;
  await writeFile(path.join(root, 'runtime.mjs'), source);
};

const writeTsconfig = async (root, files) => {
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
    files
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

const auditTarget = async (target, tarballs, sharedTarballs) => {
  const root = await mkdtemp(path.join(tmpdir(), `${target.directory}-consumer-`));
  try {
    const packageDirectories = [...SHARED_PACKAGE_DIRECTORIES, target.directory];
    const packed = new Map(sharedTarballs);
    packed.set(target.directory, await pack(path.join(workspaceRoot, 'packages', target.directory), tarballs));

    const packageJson = {
      name: `${target.directory}-consumer`,
      private: true,
      type: 'module',
      dependencies: Object.fromEntries(
        packageDirectories.map(directory => [`@aiao/${directory}`, `file:${packed.get(directory)}`])
      ),
      devDependencies: {
        '@types/ms': workspacePackageJson.devDependencies['@types/ms'],
        '@types/node': workspacePackageJson.devDependencies['@types/node']
      }
    };
    await writeFile(path.join(root, 'package.json'), JSON.stringify(packageJson, null, 2));
    await writeFile(path.join(root, '.npmrc'), 'node-linker=hoisted\n');
    await run('pnpm', ['install', '--prefer-offline', '--ignore-scripts', '--no-frozen-lockfile'], root);
    const files = await writeConsumer(root, target);
    await writeTsconfig(root, files);
    await writeRuntime(root, target);

    const tscPath = path.join(workspaceRoot, 'node_modules/typescript/bin/tsc');
    await run(process.execPath, [tscPath, '--project', 'tsconfig.json', '--pretty', 'false'], root);
    await run(process.execPath, [tscPath, '--project', 'tsconfig.bundler.json', '--pretty', 'false'], root);
    await run(process.execPath, ['runtime.mjs'], root);

    const entries = target.hasHostEntry ? 'dual entry' : 'single entry';
    process.stdout.write(
      `Published consumer passed: ${target.packageName} ${entries}, NodeNext + Bundler` +
        `${target.hasHostEntry ? ' + host round-trip' : ''}.\n`
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
};

const tarballs = await mkdtemp(path.join(tmpdir(), 'desktop-adapter-pack-'));
try {
  // 共享闭包只打一次：两个 target 用的是同一批 tarball，重打一遍纯粹是白等。
  const sharedTarballs = new Map();
  for (const directory of SHARED_PACKAGE_DIRECTORIES) {
    sharedTarballs.set(directory, await pack(path.join(workspaceRoot, 'packages', directory), tarballs));
  }

  for (const target of TARGETS) {
    await auditTarget(target, tarballs, sharedTarballs);
  }
} finally {
  await rm(tarballs, { force: true, recursive: true });
}
