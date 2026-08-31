import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  auditPackage,
  auditPackages,
  findMissingDistTargets,
  listRuntimeDistTargets
} from './subpath-build-entries.mjs';

/** 用一组「已产出」的路径造一个 exists 判定。 */
const built = (...targets) => {
  const set = new Set(targets);
  return target => set.has(target);
};

test('构建期条件（types / @aiao/source）不算运行时目标', () => {
  const packageJson = {
    exports: {
      './testing': {
        '@aiao/source': './src/testing.ts',
        types: './dist/testing.d.ts',
        import: './dist/testing.js',
        default: './dist/testing.js'
      }
    }
  };

  assert.deepEqual(listRuntimeDistTargets(packageJson), [
    { subpath: './testing', target: './dist/testing.js' },
    { subpath: './testing', target: './dist/testing.js' }
  ]);
});

test('子路径 key 与 condition key 混排时归属到正确的子路径', () => {
  const packageJson = {
    exports: {
      '.': { import: './dist/index.js' },
      './package.json': './package.json',
      './fts': { import: './dist/fts/index.js' }
    }
  };

  assert.deepEqual(listRuntimeDistTargets(packageJson), [
    { subpath: '.', target: './dist/index.js' },
    { subpath: './fts', target: './dist/fts/index.js' }
  ]);
});

test('exports 简写成字符串时按主入口收', () => {
  assert.deepEqual(listRuntimeDistTargets({ exports: './dist/index.js' }), [
    { subpath: '.', target: './dist/index.js' }
  ]);
});

test('fallback 数组里的每个候选都要检查——数组不是「随便哪个在就行」', () => {
  const packageJson = { exports: { '.': { import: ['./dist/index.js', './dist/index.cjs'] } } };

  assert.deepEqual(listRuntimeDistTargets(packageJson), [
    { subpath: '.', target: './dist/index.js' },
    { subpath: '.', target: './dist/index.cjs' }
  ]);
});

test('声明了 ./testing 但产物里没有它时报违规', () => {
  const packageJson = {
    name: '@aiao/rxdb-adapter-sqlite',
    exports: {
      '.': { import: './dist/index.js' },
      './testing': { '@aiao/source': './src/testing.ts', import: './dist/testing.js' }
    }
  };

  const offenders = findMissingDistTargets(packageJson, built('./dist/index.js'));

  assert.deepEqual(offenders, ['@aiao/rxdb-adapter-sqlite:./testing -> ./dist/testing.js']);
});

test('同一子路径的多个 condition 指向同一死链时只报一条', () => {
  const packageJson = {
    name: '@aiao/pkg',
    exports: { './testing': { import: './dist/testing.js', default: './dist/testing.js' } }
  };

  assert.equal(findMissingDistTargets(packageJson, built('./dist/index.js')).length, 1);
});

test('同一子路径指向两个不同死链时分别报', () => {
  const packageJson = {
    name: '@aiao/pkg',
    exports: { './testing': { import: './dist/testing.js', require: './dist/testing.cjs' } }
  };

  assert.equal(findMissingDistTargets(packageJson, built()).length, 2);
});

test('产物齐全时通过', () => {
  const packageJson = {
    name: '@aiao/rxdb-adapter-sqlite-core',
    exports: {
      '.': { import: './dist/index.js' },
      './desktop-host': { import: './dist/desktop-host.js' },
      './testing': { import: './dist/testing.js' }
    }
  };

  const exists = built('./dist/index.js', './dist/desktop-host.js', './dist/testing.js');

  assert.deepEqual(findMissingDistTargets(packageJson, exists), []);
});

test('还没构建的包记为 skipped，不冒充「已检查」', async () => {
  const fixture = new URL('./__fixtures__/subpath-build-entries/not-built/', import.meta.url);

  assert.deepEqual(await auditPackage(fixture.pathname), { status: 'skipped', offenders: [] });
});

test('包没有任何 dist 目标时跳过', async () => {
  const fixture = new URL('./__fixtures__/subpath-build-entries/source-only/', import.meta.url);

  assert.deepEqual(await auditPackage(fixture.pathname), { status: 'skipped', offenders: [] });
});

/**
 * 「已构建」的夹具只能在运行时造：`.gitignore` 忽略 `dist`，
 * 提交进 `__fixtures__` 的 dist 目录在别人的干净 checkout 上根本不存在。
 */
const withBuiltPackage = async run => {
  const root = await mkdtemp(join(tmpdir(), 'subpath-build-entries-'));
  const packageDir = join(root, 'built');
  await mkdir(join(packageDir, 'dist'), { recursive: true });
  await writeFile(
    join(packageDir, 'package.json'),
    JSON.stringify({
      name: '@fixture/built',
      type: 'module',
      exports: {
        '.': { '@aiao/source': './src/index.ts', import: './dist/index.js' },
        './testing': { '@aiao/source': './src/testing.ts', import: './dist/testing.js' }
      }
    })
  );
  await writeFile(join(packageDir, 'dist', 'index.js'), 'export const built = true;\n');
  try {
    await run({ root, packageDir });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
};

test('构建过的包记为 checked——扫过的包数是「门禁到底跑没跑」的唯一凭据', async () => {
  await withBuiltPackage(async ({ packageDir }) => {
    assert.deepEqual(await auditPackage(packageDir), {
      status: 'checked',
      offenders: ['@fixture/built:./testing -> ./dist/testing.js']
    });
  });
});

test('未构建的包不计入 checked，只有真正扫过的才计', async () => {
  await withBuiltPackage(async ({ root }) => {
    await mkdir(join(root, 'never-built'), { recursive: true });
    await writeFile(
      join(root, 'never-built', 'package.json'),
      JSON.stringify({ name: '@fixture/never-built', exports: { '.': { import: './dist/index.js' } } })
    );

    const { checked, offenders } = await auditPackages(root);

    assert.equal(checked, 1);
    assert.deepEqual(offenders, ['@fixture/built:./testing -> ./dist/testing.js']);
  });
});
