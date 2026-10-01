import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { POSTINSTALL_NX_ENV, buildNeedLibs, pruneDanglingBinShims } from './check-workspace.mjs';

const BUILD_ARG = 'nx run-many --target=build --projects=rxdb-test --no-cloud';
const GRAPH_PROBE_ARG = 'nx show projects --json';

test('首次构建成功时不 reset', async () => {
  const calls = [];
  await buildNeedLibs({
    projects: ['rxdb-test'],
    runCommand: async (command, args, options) => {
      calls.push({ command, args, options });
    }
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, 'pnpm');
  assert.equal(calls[0].args[0], BUILD_ARG);
  assert.deepEqual(calls[0].options.env, POSTINSTALL_NX_ENV);
});

test('图读不出来（真的损坏）才 reset 后再试一次', async () => {
  const calls = [];
  await buildNeedLibs({
    projects: ['rxdb-test'],
    runCommand: async (command, args, options) => {
      calls.push({ command, args, options });
      if (args[0] === GRAPH_PROBE_ARG) throw new Error('Failed to process project graph');
      if (calls.length === 1) throw new Error('Failed to process project graph');
    }
  });

  assert.deepEqual(
    calls.map(call => call.args[0]),
    [BUILD_ARG, GRAPH_PROBE_ARG, 'nx reset', BUILD_ARG]
  );
  assert.deepEqual(calls.at(-1).options.env, POSTINSTALL_NX_ENV);
});

// 这是本次改动的核心：编译错误不该触发 `nx reset`。
// reset 会清掉全仓 Nx 缓存，然后原样再失败一遍 —— 时间翻倍、缓存归零、
// 真正的编译错误还被第二轮输出冲到屏幕外。
test('图正常时不 reset，直接抛出原始构建错误', async () => {
  const calls = [];
  await assert.rejects(
    () =>
      buildNeedLibs({
        projects: ['rxdb-test'],
        runCommand: async (_command, args) => {
          calls.push(args[0]);
          if (args[0] === BUILD_ARG) throw new Error('TS2322: Type error in src/index.ts');
        }
      }),
    /TS2322/
  );

  assert.deepEqual(calls, [BUILD_ARG, GRAPH_PROBE_ARG]);
});

test('reset 后重试仍失败则抛出第二次错误', async () => {
  let attempts = 0;
  await assert.rejects(
    () =>
      buildNeedLibs({
        projects: ['rxdb-test'],
        runCommand: async (_command, args) => {
          if (args[0] === 'nx reset') return;
          if (args[0] === GRAPH_PROBE_ARG) throw new Error('Failed to process project graph');
          attempts += 1;
          throw new Error(attempts === 1 ? 'first' : 'still broken');
        }
      }),
    /still broken/
  );
  assert.equal(attempts, 2);
});

test('空项目列表不跑 nx', async () => {
  let called = false;
  await buildNeedLibs({
    projects: [],
    runCommand: async () => {
      called = true;
    }
  });
  assert.equal(called, false);
});

/** 造一个 pnpm 风格的 sh shim：exec 行指向 `node_modules/.pnpm/<storeDir>/...` */
const writeShim = (binDir, name, storeDir) => {
  mkdirSync(binDir, { recursive: true });
  const target = `$basedir/../../../../node_modules/.pnpm/${storeDir}/node_modules/${name}/bin/${name}.js`;
  writeFileSync(join(binDir, name), `#!/bin/sh\nexec node  "${target}" "$@"\n`);
};

const withFixture = run => {
  const rootDir = mkdtempSync(join(tmpdir(), 'check-workspace-'));
  try {
    run(rootDir);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
};

// store 目录的 hash 变了（如 @types/node 升 patch）之后，已不再是直接依赖的 shim 不会被 pnpm 重写或删除，
// 却仍排在根 .bin 之前，`vite build` 撞上 MODULE_NOT_FOUND。
test('删除指向已不存在 store 目录的 shim，保留仍有效的', () => {
  withFixture(rootDir => {
    mkdirSync(join(rootDir, 'node_modules', '.pnpm', 'vite@8.3.0_new', 'node_modules'), { recursive: true });
    const binDir = join(rootDir, 'packages', 'rxdb', 'node_modules', '.bin');
    writeShim(binDir, 'vite', 'vite@8.3.0_new');
    writeShim(binDir, 'sass', 'sass@1.104.1');

    const removed = pruneDanglingBinShims({ rootDir, memberDirs: [join(rootDir, 'packages', 'rxdb')] });

    assert.deepEqual(removed, [join(binDir, 'sass')]);
    assert.equal(existsSync(join(binDir, 'vite')), true);
    assert.equal(existsSync(join(binDir, 'sass')), false);
  });
});

test('成员没有 node_modules/.bin 时跳过', () => {
  withFixture(rootDir => {
    const removed = pruneDanglingBinShims({ rootDir, memberDirs: [join(rootDir, 'packages', 'empty')] });
    assert.deepEqual(removed, []);
  });
});
