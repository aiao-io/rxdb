import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  componentScripts,
  initialScripts,
  lazyScripts,
  scriptNameOf,
  scriptsDeclaring,
  seedScripts,
  staticImports
} from './chunks.mjs';

test('只认静态 import，动态 import 不算', () => {
  const source = 'import{a as b}from"./chunk-A.js";import"./chunk-B.js";const c=()=>import("./chunk-C.js");';
  assert.deepEqual(staticImports(source).sort(), ['chunk-A.js', 'chunk-B.js']);
});

test('首屏脚本是 index.html 的脚本与预加载加上静态 import 闭包；其余 chunk 是按需加载的', async () => {
  const root = await mkdtemp(join(tmpdir(), 'chunks-spec-'));
  try {
    await writeFile(
      join(root, 'index.html'),
      '<link rel="modulepreload" href="chunk-A.js"><script src="main-X.js" type="module"></script>'
    );
    await writeFile(
      join(root, 'main-X.js'),
      'import{x}from"./chunk-B.js";button.onclick=()=>import("./chunk-LAZY.js");'
    );
    await writeFile(join(root, 'chunk-A.js'), 'export const a=1;');
    await writeFile(join(root, 'chunk-B.js'), 'import"./chunk-C.js";export const x=1;');
    await writeFile(join(root, 'chunk-C.js'), 'export const c=1;');
    await writeFile(join(root, 'chunk-LAZY.js'), 'export const lazy=1;');
    await writeFile(join(root, 'worker-K.js'), 'export {};');
    assert.deepEqual([...initialScripts(root)].sort(), ['chunk-A.js', 'chunk-B.js', 'chunk-C.js', 'main-X.js']);
    assert.deepEqual([...lazyScripts(root)], ['chunk-LAZY.js']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('请求 URL 换算成产物根目录脚本名，别的来源与子目录不算', () => {
  const origin = 'http://127.0.0.1:1234';
  assert.equal(scriptNameOf(`${origin}/chunk-A.js`, origin), 'chunk-A.js');
  assert.equal(scriptNameOf(`${origin}/assets/x.js`, origin), null);
  assert.equal(scriptNameOf('https://vscode.aiao.io/main.js', origin), null);
  assert.equal(scriptNameOf(`${origin}/saltline.html`, origin), null);
});

test('从产物里读出每个脚本声明的组件选择器和数据域种子', async () => {
  const root = await mkdtemp(join(tmpdir(), 'chunks-spec-'));
  try {
    await writeFile(join(root, 'chunk-A.js'), 'static \u0275cmp=x({type:o,selectors:[[`app-notes`]],viewQuery:1})');
    await writeFile(join(root, 'chunk-B.js'), 'x({selectors:[["app-mail"]]});y({selectors:[[`app-mail-compose`]]})');
    await writeFile(join(root, 'chunk-C.js'), 'const s={domain:`notes`,version:1,async run(){}}');
    await writeFile(join(root, 'chunk-D.js'), 'const icon={icon:`app-notes`};const d={domain:`x`,note:1}');
    const components = componentScripts(root);
    assert.deepEqual(scriptsDeclaring(components, 'app-notes'), ['chunk-A.js']);
    assert.deepEqual(components.get('chunk-B.js')?.sort(), ['app-mail', 'app-mail-compose']);
    assert.equal(components.has('chunk-D.js'), false);
    const seeds = seedScripts(root);
    assert.deepEqual(scriptsDeclaring(seeds, 'notes'), ['chunk-C.js']);
    assert.equal(seeds.has('chunk-D.js'), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
