/**
 * 发布 tarball 的隔离消费验证（US-602 AC#8）。
 *
 * 工作区内 peer 写法绿（`.npmrc` 开了 auto-install-peers）不能证明外部消费者装配安全，
 * 所以本脚本在工作区**外**的临时目录分别用 npm 与 pnpm 安装同一批真实 `pnpm pack` 出来的 tgz：
 * 不经 workspace links、不经 tsconfig paths，验证的是发布产物本身。
 *
 * 守的性质：
 * 1. **发布依赖写法**：每个 tgz 的 manifest 里 `@aiao/*` 安装边全部改写为 `^<版本>`，
 *    不残留 `workspace:` 协议；核心只在 peerDependencies；入口与 `.d.ts` 齐全。
 * 2. **代表组合可装配**：本地 QueryCache 链（adapter + 三个插件）、三框架绑定、
 *    optional peer 缺口（未发布的可选 peer 缺失不炸安装）分别经 npm 与 pnpm 安装并类型检查 / 最小构建。
 * 3. **核心单实例**：同一消费者里从不同包的上下文解析 `@aiao/rxdb` 得到同一物理路径，
 *    `node_modules` 里只有一份核心目录。
 * 4. **核心版本冲突明确失败**：核心与 utils 的 tgz 抬一个 patch 后与旧版插件同装，
 *    npm 与 pnpm 都必须以清晰的 peer 冲突错误退出，而不是静默装成两份。
 * 5. **A1 样例源**：在消费端用 registry 的 TypeScript 编译 `scripts/examples/ai-local/main.ts` 并执行，
 *    跑通 `use → adapter → connect → CRUD → disconnect` 后正常退出。
 *
 * 组合差异集中在 {@link COMBOS} 一张表里；打包根按 `nx.json` 的 `release.projects`
 * 逐项目解析（`nx-release-publish` 的 `packageRoot`，缺省为项目根，与 nx release 一致）。
 *
 * @example
 * ```bash
 * pnpm verify:release-consumers
 * ```
 */

import { globSync } from 'glob';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { linkReleasePeers } from './link-release-peers.mjs';

const execFileAsync = promisify(execFile);
const workspaceRoot = process.cwd();
const workspacePackageJson = JSON.parse(await readFile(path.join(workspaceRoot, 'package.json'), 'utf8'));

const writePnpmWorkspace = (root, overrides) =>
  writeFile(path.join(root, 'pnpm-workspace.yaml'), `${JSON.stringify({ packages: [], overrides }, null, 2)}\n`);

/**
 * 跑一条子命令；失败时一定把两个流都转出去（`tsc` 把诊断写在 stdout，
 * `npm` / `pnpm` 把 ERESOLVE / peer 冲突写在 stderr，丢了就只剩一行「命令失败了」）。
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
    return { stdout, stderr };
  } catch (error) {
    const stdout = error.stdout ?? '';
    const stderr = error.stderr ?? '';
    if (forwardOutput) {
      process.stdout.write(stdout);
      process.stderr.write(stderr);
    }
    error.output = `${stdout}\n${stderr}`;
    throw error;
  }
};

/**
 * 按 `nx.json` 的 `release.projects` 解析各项目的发布根。
 *
 * @remarks 与 `nx release publish` 一致：`nx-release-publish` 目标的
 * `options.packageRoot ?? projectConfig.root`。Angular 系发布
 * `dist/packages/<name>`（ng-packagr 产物），其余从源码根 pack（`files: ["dist", …]` 决定内容）。
 */
function resolveReleaseProjects() {
  const nx = JSON.parse(readFileSync(path.join(workspaceRoot, 'nx.json'), 'utf8'));
  const patterns = nx.release?.projects ?? [];
  assert.ok(patterns.length, 'nx.json 缺少 release.projects');
  const directories = patterns
    .flatMap(pattern => (pattern.includes('*') ? globSync(pattern, { cwd: workspaceRoot }) : [pattern]))
    .filter(directory => existsSync(path.join(workspaceRoot, directory, 'package.json')))
    .sort();
  return directories.map(directory => {
    const manifest = JSON.parse(readFileSync(path.join(workspaceRoot, directory, 'package.json'), 'utf8'));
    const projectConfigPath = path.join(workspaceRoot, directory, 'project.json');
    let packageRoot = directory;
    if (existsSync(projectConfigPath)) {
      const configured = JSON.parse(readFileSync(projectConfigPath, 'utf8')).targets?.['nx-release-publish']?.options
        ?.packageRoot;
      if (configured) packageRoot = configured.replaceAll('{projectRoot}', directory);
    }
    return { directory, name: manifest.name, version: manifest.version, packageRoot };
  });
}

/**
 * 代表组合。`directories` 是打包集，`registryDependencies` 是该组合里
 * 插件 / 适配器要求的非 `@aiao/*` peer（rxjs、框架等，从 registry 安装）；
 * 消费者统一不开 auto-install-peers，所有必装 peer 必须在这里显式声明。
 */
const COMBOS = [
  {
    id: 'querycache',
    directories: [
      'utils',
      'rxdb',
      'rxdb-adapter-sqlite-core',
      'rxdb-adapter-encrypted',
      'rxdb-adapter-http',
      'rxdb-plugin-history',
      'rxdb-plugin-querycache',
      'rxdb-plugin-sync'
    ],
    registryDependencies: { rxjs: '^7.8.2' }
  },
  {
    id: 'bindings',
    directories: [
      'utils',
      'rxdb',
      'rxdb-adapter-sqlite-core',
      'rxdb-client-generator',
      'rxdb-plugin-graph',
      'rxdb-angular',
      'rxdb-react',
      'rxdb-vue'
    ],
    registryDependencies: {
      rxjs: '^7.8.2',
      react: '^19.3.0',
      'react-dom': '^19.3.0',
      vue: '^3.5.43',
      '@angular/core': '22.2.3',
      '@angular/common': '22.2.3',
      '@angular/platform-browser': '22.2.3',
      '@angular/compiler': '22.2.3',
      ngxtension: '^7.0.1'
    }
  },
  {
    id: 'optional-peers',
    directories: [
      'utils',
      'rxdb',
      'rxdb-adapter-sqlite-core',
      'rxdb-adapter-encrypted',
      'rxdb-adapter-pglite',
      'rxdb-adapter-sqlite-wasm',
      'rxdb-plugin-history',
      'rxdb-plugin-sync',
      'rxdb-plugin-replay',
      'rxdb-plugin-search'
    ],
    registryDependencies: { rxjs: '^7.8.2' }
  },
  {
    id: 'ai-sample',
    directories: [
      'utils',
      'rxdb',
      'rxdb-adapter-pglite',
      'rxdb-plugin-history',
      'rxdb-client-generator',
      'rxdb-plugin-tree'
    ],
    registryDependencies: { rxjs: '^7.8.2' },
    devDependencies: {
      typescript: workspacePackageJson.devDependencies.typescript,
      '@types/node': workspacePackageJson.devDependencies['@types/node'],
      '@types/emscripten': workspacePackageJson.devDependencies['@types/emscripten']
    }
  },
  {
    id: 'incompatible-core',
    directories: ['rxdb-adapter-encrypted'],
    bumped: ['rxdb', 'utils'],
    registryDependencies: { rxjs: '^7.8.2' },
    expectInstallFailure: true
  }
];

/**
 * 同一批 tgz 分别用 npm 与 pnpm 安装（消费者不在工作区内，不经 workspace links / tsconfig paths）。
 * 成功返回 `{ failed: false }`；失败时返回非零退出与完整输出，由调用方按组合断言。
 */
const install = async (manager, root) => {
  const pnpm = ['install', '--prefer-offline', '--ignore-scripts', '--no-frozen-lockfile'];
  const npm = ['install', '--no-audit', '--no-fund', '--ignore-scripts'];
  const attempts =
    manager === 'npm' ?
      [npm, npm] // npm 不用 --prefer-offline：大 packument（@angular/*）的坏缓存会以「Found: X@undefined」的假冲突炸掉全新解析；失败重试一次。
    : [pnpm];
  for (let index = 0; index < attempts.length; index++) {
    try {
      await run(manager, attempts[index], root, false);
      return { failed: false, output: '' };
    } catch (error) {
      if (index < attempts.length - 1) continue;
      return { failed: true, output: error.output ?? `${error.stdout ?? ''}\n${error.stderr ?? ''}` };
    }
  }
};

/**
 * 真实 `pnpm pack`（不是 dry-run）：`workspace:^` 只在 pack / publish 时改写，
 * 这里必须拿到改写后的 tgz。
 */
const pack = async (packageRoot, destination) => {
  const previous = new Set(await readdir(destination));
  process.stdout.write(`packing ${path.basename(packageRoot)}\n`);
  try {
    await run('pnpm', ['pack', '--pack-destination', destination], packageRoot, false);
  } catch (error) {
    error.message = `pnpm pack 失败（cwd=${packageRoot}）：${error.message}`;
    throw error;
  }
  const tarballs = (await readdir(destination)).filter(entry => entry.endsWith('.tgz') && !previous.has(entry));
  assert.equal(tarballs.length, 1, `pnpm pack produced ${tarballs.length} new tarballs for ${packageRoot}`);
  return path.join(destination, tarballs[0]);
};

/**
 * 从已打包的 tgz 重打一个抬过版本的副本（冲突用例用）：解包 → 改 version 并把
 * 内部 `@aiao/*` 边改写到抬过的版本 → 重新打 tgz。不依赖 npm registry 上存在
 * 任何版本，全离线可复现。
 */
const rebump = async (tgzPath, bumpedVersions, destination) => {
  const work = await mkdtemp(path.join(destination, 'rebump-'));
  try {
    await run('tar', ['-xzf', tgzPath, '-C', work]);
    const manifestPath = path.join(work, 'package/package.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    manifest.version = bumpedVersions.get(manifest.name);
    for (const field of ['dependencies', 'peerDependencies']) {
      for (const name of Object.keys(manifest[field] ?? {})) {
        if (name.startsWith('@aiao/')) manifest[field][name] = `^${bumpedVersions.get(name)}`;
      }
    }
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
    const output = path.join(destination, `aiao-${manifest.name.split('/')[1]}-${manifest.version}.tgz`);
    await run('tar', ['-czf', output, 'package'], work);
    return output;
  } finally {
    await rm(work, { force: true, recursive: true });
  }
};

/** 解包一个 tgz，校验发布依赖写法与入口 / 类型文件齐全。 */
const auditPackedManifest = async (tgzPath, versions, destination) => {
  const work = await mkdtemp(path.join(destination, 'unpack-'));
  try {
    await run('tar', ['-xzf', tgzPath, '-C', work]);
    const root = path.join(work, 'package');
    const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
    const label = `${manifest.name}@${manifest.version}`;
    const serialized = JSON.stringify(manifest);
    assert.ok(!serialized.includes('workspace:'), `${label}: 发布产物残留 workspace: 协议`);

    // 依赖写法：核心只在 peer；每个 @aiao/* 安装边必须是 ^<该包版本>。
    // 未发布的可选 peer（如 rxdb-plugin-tree）允许不在本批打包集里。
    assert.equal(manifest.dependencies?.['@aiao/rxdb'], undefined, `${label}: @aiao/rxdb 必须在 peerDependencies`);
    const optionalPeers = new Set(
      Object.entries(manifest.peerDependenciesMeta ?? {})
        .filter(([, meta]) => meta?.optional === true)
        .map(([name]) => name)
    );
    for (const [field, entries] of [
      ['dependencies', manifest.dependencies ?? {}],
      ['peerDependencies', manifest.peerDependencies ?? {}]
    ]) {
      for (const [name, range] of Object.entries(entries)) {
        if (!name.startsWith('@aiao/')) continue;
        const optional = field === 'peerDependencies' && optionalPeers.has(name);
        if (optional && !versions.has(name)) continue;
        assert.ok(versions.has(name), `${label}: ${field} 边 ${name} 不在本批打包集`);
        assert.equal(
          range,
          `^${versions.get(name)}`,
          `${label}: ${field} ${name} 应为 ^${versions.get(name)}（现为 ${range}）`
        );
      }
    }

    // 入口与类型文件齐全：exports 的 types / import / default / require 目标都必须真在 tgz 里。
    for (const [entry, target] of Object.entries(manifest.exports ?? {})) {
      const candidates =
        typeof target === 'string' ?
          [target]
        : [target?.types, target?.import, target?.default, target?.require].filter(Boolean);
      assert.ok(candidates.length, `${label}: exports.${entry} 无任何目标`);
      for (const file of candidates) {
        assert.ok(existsSync(path.join(root, file)), `${label}: exports.${entry} 指向不存在的 ${file}`);
      }
      if (typeof target === 'object' && target.types)
        assert.ok(target.types.endsWith('.d.ts'), `${label}: exports.${entry} 的 types 不是 .d.ts`);
    }
    const mainEntry = manifest.exports?.['.'];
    const mainTypes = typeof mainEntry === 'object' ? mainEntry.types : manifest.types;
    assert.ok(mainTypes && mainTypes.endsWith('.d.ts'), `${label}: 主入口缺少 .d.ts 类型声明`);
    assert.ok(existsSync(path.join(root, mainTypes)), `${label}: 主入口类型文件 ${mainTypes} 不在 tgz 里`);
  } finally {
    await rm(work, { force: true, recursive: true });
  }
};

/** 消费者内跑的运行时探针：入口可导入、核心解析为同一物理路径且只有一份。 */
const writeProbe = async (root, packageNames) => {
  const source = `
import assert from 'node:assert/strict';
import { readdirSync, realpathSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const packages = ${JSON.stringify(packageNames)};

// Angular 绑定是部分编译库：无 AOT 的裸 Node 导入需要 JIT 编译器兜底（Angular 官方提示的注册方式）。
if (packages.includes('@aiao/rxdb-angular')) await import('@angular/compiler');

for (const pkg of packages) {
  const namespace = await import(pkg);
  assert.ok(Object.keys(namespace).length > 0, pkg + ' 入口没有任何导出');
}

const core = require.resolve('@aiao/rxdb');
const coreReal = realpathSync(core);
for (const pkg of packages) {
  const entry = require.resolve(pkg);
  const contextRequire = createRequire(entry);
  const resolved = realpathSync(contextRequire.resolve('@aiao/rxdb'));
  assert.equal(resolved, coreReal, pkg + ' 解析出第二个核心副本：' + resolved);
}

const consumerRoot = path.dirname(require.resolve('@aiao/rxdb/package.json'));
const nodeModules = consumerRoot.slice(0, consumerRoot.indexOf('node_modules') + 'node_modules'.length);
const copies = [];
const walk = directory => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const full = path.join(directory, entry.name);
    if (entry.name === '@aiao') {
      const coreDir = path.join(full, 'rxdb');
      if (existsSync(coreDir)) copies.push(coreDir);
    }
    walk(full);
  }
};
walk(nodeModules);
assert.deepEqual(copies, [path.join(nodeModules, '@aiao', 'rxdb')], 'node_modules 里核心不止一份：' + copies.join(', '));
console.log('✅ 探针：入口导入、核心单实例（' + coreReal + '）通过');
`;
  await writeFile(path.join(root, 'probe.mjs'), source);
};

/** 类型检查源码：每个包的主入口都要能被消费端 TS 解析并真用一遍类型。 */
const writeTypecheckSource = (root, packageNames) => {
  const source = `
import * as rxdb from '@aiao/rxdb';
import { RxDB } from '@aiao/rxdb';
${packageNames
  .filter(name => name !== '@aiao/rxdb')
  .map((name, index) => `import * as pkg${index} from '${name}';`)
  .join('\n')}
import type { EntityBase } from '@aiao/rxdb';

const namespaces: unknown[] = [rxdb, ${packageNames
    .filter(name => name !== '@aiao/rxdb')
    .map((_, index) => `pkg${index}`)
    .join(', ')}];
void namespaces;

const database: RxDB = rxdb.RxDB.prototype as unknown as RxDB;
void database;

declare const entity: EntityBase;
void entity;
`;
  writeFileSync(path.join(root, 'consumer.ts'), source);
};

const writeTsconfig = async (root, files, resolution = 'NodeNext') => {
  const config = {
    compilerOptions: {
      module: resolution === 'Bundler' ? 'ESNext' : 'NodeNext',
      moduleResolution: resolution,
      target: 'ES2022',
      strict: true,
      noEmit: true,
      // 消费者标准姿势：optional peer（如 rxdb-plugin-tree）的 d.ts 闭包缺口是包历史事实，
      // 不装可选 peer 的合法组合在 skipLibCheck:false 下会报 TS2307；严格 d.ts 检查由
      // A1 样例组合承担（样例自带 skipLibCheck:false 并装全其闭包）。
      skipLibCheck: true,
      types: ['node']
    },
    files
  };
  await writeFile(path.join(root, 'tsconfig.json'), JSON.stringify(config, null, 2));
};

/** 三框架绑定：各自一个入口，能导入、能过 tsc、能被 esbuild 最小构建。 */
const writeBindingEntries = async root => {
  const entries = [
    ['angular', "import { provideRxDB, useRxDB } from '@aiao/rxdb-angular';\nvoid provideRxDB;\nvoid useRxDB;\n"],
    ['react', "import { useRxDB } from '@aiao/rxdb-react';\nvoid useRxDB;\n"],
    ['vue', "import { provideRxDB, useRxDB } from '@aiao/rxdb-vue';\nvoid provideRxDB;\nvoid useRxDB;\n"]
  ];
  for (const [name, content] of entries) await writeFile(path.join(root, `binding-${name}.ts`), content);
  return entries.map(([name]) => `binding-${name}.ts`);
};

/** A1 样例：拷贝样例源与 tsconfig，用消费端 TypeScript 编译并执行。 */
const writeSample = async root => {
  const sampleRoot = path.join(workspaceRoot, 'scripts/examples/ai-local');
  await cp(path.join(sampleRoot, 'main.ts'), path.join(root, 'main.ts'));
  await cp(path.join(sampleRoot, 'tsconfig.json'), path.join(root, 'tsconfig.json'));
};

/** 一个组合 × 一个包管理器的一次完整消费验证。 */
const auditConsumer = async (combo, manager, packed, bumped) => {
  const root = await mkdtemp(path.join(tmpdir(), `release-consumer-${combo.id}-${manager}-`));
  try {
    // 抬过版本的副本只属于「核心版本不兼容」组合；其余组合一律用正常版本的 tgz。
    const fileTarball = directory =>
      combo.expectInstallFailure && bumped.has(directory) ? bumped.get(directory) : packed.get(directory);
    const dependencyEntries = Object.fromEntries(
      [...combo.directories, ...(combo.bumped ?? [])].map(directory => [
        `@aiao/${directory}`,
        `file:${fileTarball(directory)}`
      ])
    );
    const overrides = dependencyEntries;
    const manifest = {
      name: `release-consumer-${combo.id}-${manager}`,
      private: true,
      type: 'module',
      dependencies: { ...dependencyEntries, ...(combo.registryDependencies ?? {}) },
      devDependencies: {
        '@types/node': workspacePackageJson.devDependencies['@types/node'],
        ...(combo.devDependencies ?? {})
      },
      // 冲突组合：npm 不写 overrides（npm 的 overrides 会把 peer 边改写成被覆盖版本且不再校验，
      // 安装会静默成功；不覆盖时以 ERESOLVE 明确失败）；pnpm 保留 overrides 钉住本地 tgz，
      // 严格 peer 校验仍会以 peer 冲突明确失败（无 overrides 时反而先报 registry 404，不够明确）。
      ...(!(combo.expectInstallFailure && manager === 'npm') && manager === 'npm' ? { overrides } : {})
    };
    await writeFile(path.join(root, 'package.json'), JSON.stringify(manifest, null, 2));
    if (manager === 'pnpm') {
      await writePnpmWorkspace(root, overrides);
      await writeFile(
        path.join(root, '.npmrc'),
        'node-linker=hoisted\nauto-install-peers=false\nstrict-peer-dependencies=true\n'
      );
    }
    const result = await install(manager, root);
    if (combo.expectInstallFailure) {
      assert.ok(result.failed, `${combo.id}/${manager}: 核心版本不兼容必须安装失败，却成功了`);
      assert.match(
        result.output,
        /@aiao\/rxdb/,
        `${combo.id}/${manager}: 安装失败但没有指出 @aiao/rxdb：\n${result.output}`
      );
      assert.match(
        result.output,
        /ERESOLVE|ERR_PEER_INVALID|peer|conflict/i,
        `${combo.id}/${manager}: 失败原因不明确：\n${result.output}`
      );
      process.stdout.write(
        `Published consumer passed: ${combo.id}/${manager} 核心版本不兼容明确失败（${result.output
          .split('\n')
          .find(line => /ERESOLVE|ERR_PEER_INVALID|peer|conflict/i.test(line))
          ?.trim()})\n`
      );
      return;
    }
    assert.ok(!result.failed, `${combo.id}/${manager}: 安装失败\n${result.output}`);

    const packageNames = combo.directories.map(directory => `@aiao/${directory}`).sort();
    await writeProbe(root, packageNames);

    const tscPath = path.join(workspaceRoot, 'node_modules/typescript/bin/tsc');
    if (combo.id === 'bindings') {
      const files = await writeBindingEntries(root);
      // UI 绑定走 Bundler 解析（应用消费者标准姿势）；NodeNext 下 rxdb-vue 的
      // 无扩展名 `export *` d.ts 链不可见（已发布 0.0.26 同样如此，预存在缺陷，见 PR 遗留）。
      await writeTsconfig(root, files, 'Bundler');
      await run(process.execPath, [tscPath, '--project', 'tsconfig.json', '--pretty', 'false'], root);
      await run(process.execPath, ['probe.mjs'], root);
      const esbuildPath = path.join(workspaceRoot, 'node_modules/esbuild/bin/esbuild');
      for (const file of files) {
        // esbuild 是原生二进制，直接执行（不能经 node 执行）。
        await run(
          esbuildPath,
          [file, '--bundle', '--platform=node', '--format=esm', `--outfile=dist/${file}.mjs`, '--log-level=warning'],
          root
        );
      }
      process.stdout.write(`Published consumer passed: ${combo.id}/${manager} 三框架绑定导入、tsc 与最小构建通过\n`);
      return;
    }
    if (combo.id === 'ai-sample') {
      await writeSample(root);
      await run(process.execPath, [tscPath, '--project', 'tsconfig.json', '--pretty', 'false'], root);
      await run(process.execPath, ['main.js'], root);
      process.stdout.write(`Published consumer passed: ${combo.id}/${manager} A1 样例编译、CRUD 断言与正常退出通过\n`);
      return;
    }
    writeTypecheckSource(root, packageNames);
    await writeTsconfig(root, ['consumer.ts']);
    await run(process.execPath, [tscPath, '--project', 'tsconfig.json', '--pretty', 'false'], root);
    await run(process.execPath, ['probe.mjs'], root);
    process.stdout.write(`Published consumer passed: ${combo.id}/${manager} 安装、类型检查与核心单实例通过\n`);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
};

const projects = resolveReleaseProjects();
const byDirectory = new Map(projects.map(project => [path.basename(project.directory), project]));
const unionDirectories = [...new Set(COMBOS.flatMap(combo => [...combo.directories, ...(combo.bumped ?? [])]))];
for (const directory of unionDirectories) {
  assert.ok(byDirectory.has(directory), `${directory} 不在 nx.json release.projects 里`);
}

const tarballs = await mkdtemp(path.join(tmpdir(), 'release-consumers-pack-'));
try {
  const packed = new Map();
  for (const directory of unionDirectories) {
    const project = byDirectory.get(directory);
    // 从 dist 发布的包（Angular 系）不是工作区成员，pnpm 改写 workspace:^ peer 时
    // 要从包目录的 node_modules 读兄弟 manifest——先补齐链接（真实发布链也走同一脚本）。
    if (project.packageRoot !== project.directory) linkReleasePeers(workspaceRoot, project.directory);
    packed.set(directory, await pack(path.join(workspaceRoot, project.packageRoot), tarballs));
  }
  const versions = new Map(
    [...packed.keys()].map(directory => [`@aiao/${directory}`, byDirectory.get(directory).version])
  );

  // 冲突副本：核心与 utils 抬一个 patch，其余不动。
  const bumpedVersions = new Map();
  for (const combo of COMBOS) {
    for (const directory of combo.bumped ?? []) {
      const [major, minor, patch] = versions.get(`@aiao/${directory}`).split('.').map(Number);
      bumpedVersions.set(`@aiao/${directory}`, `${major}.${minor}.${patch + 1}`);
    }
  }
  const bumped = new Map();
  for (const directory of [...bumpedVersions.keys()].map(name => name.slice('@aiao/'.length))) {
    bumped.set(directory, await rebump(packed.get(directory), bumpedVersions, tarballs));
  }

  for (const directory of unionDirectories) {
    await auditPackedManifest(packed.get(directory), versions, tarballs);
  }
  process.stdout.write(`Published consumer passed: ${packed.size} 个 tgz 的依赖写法与入口 / .d.ts 齐全\n`);

  for (const combo of COMBOS) {
    for (const manager of ['npm', 'pnpm']) {
      await auditConsumer(combo, manager, packed, bumped);
    }
  }
  console.log(`✅ 发布消费门禁：${packed.size} 个真实 tgz、${COMBOS.length} 组代表组合 × npm/pnpm 全部通过`);
} finally {
  await rm(tarballs, { force: true, recursive: true });
}
