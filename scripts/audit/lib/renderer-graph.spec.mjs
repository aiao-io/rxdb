import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { createRequire, isBuiltin } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';

import { collectRendererGraph } from './renderer-graph.mjs';

const deps = { readFile, createRequire, pathToFileURL, isBuiltin, path };

async function writeTree(root, files) {
  for (const [file, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), content);
  }
}

test('renderer 依赖图：裸名与 node: 前缀的内建、静态与动态 import 都记下，外部依赖不走', async () => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'renderer-graph-')));
  try {
    await writeTree(root, {
      'dist/index.js': "import './a.js';\nimport { join } from 'node:path';\nconst lazy = () => import('./b.js');\n",
      'dist/a.js': "import fs from 'fs';\nimport { helper } from '@aiao/x';\nimport { map } from 'ext';\n",
      'dist/b.js': "export const read = () => import('fs/promises');\n",
      'node_modules/@aiao/x/package.json': JSON.stringify({ name: '@aiao/x', main: 'index.js' }),
      'node_modules/@aiao/x/index.js': "import os from 'os';\nexport const helper = os;\n",
      'node_modules/ext/package.json': JSON.stringify({ name: 'ext', main: 'index.js' }),
      'node_modules/ext/index.js': "import crypto from 'crypto';\nexport const map = crypto;\n"
    });
    const { files, builtins } = await collectRendererGraph(path.join(root, 'dist/index.js'), deps);

    assert.deepEqual([...files].map(file => path.relative(root, file)).sort(), [
      'dist/a.js',
      'dist/b.js',
      'dist/index.js',
      'node_modules/@aiao/x/index.js'
    ]);
    assert.deepEqual(Object.fromEntries([...builtins].map(([name, file]) => [name, path.relative(root, file)])), {
      'node:path': 'dist/index.js',
      fs: 'dist/a.js',
      'fs/promises': 'dist/b.js',
      os: 'node_modules/@aiao/x/index.js'
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('renderer 依赖图：没有内建时 builtins 为空，模块路径不会被误判成内建', async () => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'renderer-graph-clean-')));
  try {
    await writeTree(root, {
      'dist/index.js': "import './path.js';\nexport * from './fs-like.js';\n",
      'dist/path.js': 'export const path = 1;\n',
      'dist/fs-like.js': 'export const fs = 1;\n'
    });
    const { files, builtins } = await collectRendererGraph(path.join(root, 'dist/index.js'), deps);

    assert.equal(files.size, 3);
    assert.equal(builtins.size, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
