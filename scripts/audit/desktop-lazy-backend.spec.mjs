/**
 * `desktop-lazy-backend.mjs` 自己的单测。
 *
 * @remarks
 * 这道门禁的价值全在**判据的准确性**上：判宽了（把惰性 chunk 算进首屏图）它天天红，
 * 判窄了（漏掉某种 import 写法）它天天绿而产物是错的。后者尤其危险 —— 一道假绿的
 * 门禁比没有门禁更糟，因为它还在替你签字。所以这里逐条钉住那几个判断。
 *
 * 夹具在临时目录里现搭，不进 `__fixtures__`：这些文件长得像真的打包产物，
 * checked-in 之后迟早有人以为它们是某次构建的残留。现搭的好处是每个用例的
 * chunk 图就写在用例里，读起来即是它要表达的那个形状。
 */

import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';

import {
  auditDemo,
  DEMOS,
  DYNAMIC_IMPORT_PATTERN,
  eagerSeeds,
  LAZY_MARKERS,
  selectDemos,
  STATIC_IMPORT_PATTERN,
  walkEagerGraph
} from './desktop-lazy-backend.mjs';

const tempRoots = [];

after(async () => {
  for (const root of tempRoots) await rm(root, { recursive: true, force: true });
});

/**
 * 现搭一个产物目录。
 *
 * @param files - 文件名 → 内容；`index.html` 必须在其中
 * @returns 绝对路径，可直接当 `auditDemo` 的 `dist`
 */
async function makeDist(files) {
  const root = await mkdtemp(path.join(tmpdir(), 'lazy-backend-'));
  tempRoots.push(root);
  for (const [name, content] of Object.entries(files)) {
    await writeFile(path.join(root, name), content, 'utf8');
  }
  return root;
}

const INDEX_HTML = '<html><body><script src="main.js" type="module"></script></body></html>';

/**
 * 一份**合格**的产物：首屏只有 `main.js`，两条后端分支各自躺在动态 chunk 里，
 * 九个标记全部分散在那两个 chunk 中。
 */
const healthyDist = () => ({
  'index.html': INDEX_HTML,
  // 适配器名与探针键留在主 chunk 是**对的**（候选表要在建库前报出后端身份），
  // 这里照抄进来，顺带钉住它们没被当成标记。
  //
  // 那句静态 import 也不是凑数：真实的 `main.js` 一定静态 import 着框架 chunk，
  // 而 `walkEagerGraph` 恰恰拿"走出过静态边"当正则还认得产物的凭据。
  'main.js': [
    'import{bootstrap}from"./chunk-app.js";',
    'const t="__aiaoRxdbDesktopHost__",a="sqlite-electron",b="wa-sqlite";',
    'export const load=x=>x?import(`./chunk-desktop.js`):import(`./chunk-wasqlite.js`);'
  ].join('\n'),
  'chunk-app.js': 'export const bootstrap=()=>1;',
  'chunk-desktop.js': [
    'class RxDBAdapterDesktopError extends Error{}',
    'const codes=["host_unavailable","protocol_violation","session_closed","unsupported_runtime_engine"];',
    'const ops=["file.writeBegin","file.writeChunk","file.lockAcquire"];'
  ].join('\n'),
  'chunk-wasqlite.js': 'const wasm="wa-sqlite-async.wasm";'
});

test('index.html 里的 src / href 都算首屏种子', () => {
  const seeds = eagerSeeds(
    [
      '<link rel="modulepreload" href="/chunk-A.js">',
      '<script src="main.js" type="module"></script>',
      '<link rel="stylesheet" href="styles.css">'
    ].join('')
  );

  assert.deepEqual([...seeds].sort(), ['chunk-A.js', 'main.js']);
});

test('首屏图只沿静态 import 走，动态 import() 的目标不算首屏', async () => {
  const dist = await makeDist({
    'index.html': INDEX_HTML,
    // 三种写法各一份：静态 from、静态裸 import、以及两种动态形式。
    'main.js': [
      'import{a}from"./chunk-static.js";',
      'import"./chunk-bare.js";',
      'const lazy=()=>import(`./chunk-lazy-backtick.js`);',
      'const lazy2=()=>import("./chunk-lazy-paren.js");'
    ].join('\n'),
    'chunk-static.js': 'export const a=1;',
    'chunk-bare.js': 'globalThis.x=1;',
    'chunk-lazy-backtick.js': 'export default 1;',
    'chunk-lazy-paren.js': 'export default 2;'
  });

  const eager = await walkEagerGraph(dist, eagerSeeds(INDEX_HTML));

  assert.deepEqual([...eager].sort(), ['chunk-bare.js', 'chunk-static.js', 'main.js']);
});

/**
 * 这条守的是整份脚本的支点。
 *
 * @remarks
 * rolldown 在 `main.js` 里发的是反引号、在 worker 里发的是紧跟左括号的双引号，
 * 两种动态写法都必须**逃过**静态正则。哪天正则被"顺手放宽"，惰性 chunk 会被算进
 * 首屏图，门禁从此永远红 —— 而那时最省事的修法是删掉标记，于是假绿。
 */
test('静态正则不吃动态 import()，动态正则两种引号都认', () => {
  const source = 'import{a}from"./s1.js";import"./s2.js";import(`./d1.js`);import("./d2.js");';

  const statics = [...source.matchAll(new RegExp(STATIC_IMPORT_PATTERN))].map(([, target]) => target);
  const dynamics = [...source.matchAll(new RegExp(DYNAMIC_IMPORT_PATTERN))].map(([, target]) => target);

  assert.deepEqual(statics, ['./s1.js', './s2.js']);
  assert.deepEqual(dynamics, ['./d1.js', './d2.js']);
});

test('一条静态边都走不出去时报错，而不是退化成"只有入口"的假绿', async () => {
  const dist = await makeDist({ 'index.html': INDEX_HTML, 'main.js': 'console.log(1);' });

  await assert.rejects(() => walkEagerGraph(dist, eagerSeeds(INDEX_HTML)), /一条边都没走出去/);
});

test('两条分支各自成惰性 chunk 时通过', async () => {
  const dist = await makeDist(healthyDist());

  const line = await auditDemo({ project: 'fixture', dist });

  assert.match(line, /^✓ fixture/);
  assert.match(line, new RegExp(`${LAZY_MARKERS.length} 个标记`));
});

test('桌面实现被摇进首屏 chunk 时失败，并点名是哪个标记哪个 chunk', async () => {
  const files = healthyDist();
  // 复刻实测过的那次回归：主 chunk 里从 barrel 取了个常量，barrel 表层的错误类型
  // 跟着进了首屏 —— 而 `file.*` 那层在更深的模块里，纹丝不动。
  files['main.js'] = `import{e}from"./chunk-leaked.js";\n${files['main.js']}`;
  files['chunk-leaked.js'] = 'export class RxDBAdapterDesktopError extends Error{}';
  files['chunk-desktop.js'] = files['chunk-desktop.js'].replace('class RxDBAdapterDesktopError extends Error{}', '');
  const dist = await makeDist(files);

  await assert.rejects(
    () => auditDemo({ project: 'fixture', dist }),
    error => {
      assert.match(error.message, /RxDBAdapterDesktopError：出现在首屏 chunk chunk-leaked\.js 里/);
      assert.match(error.message, /首屏图（3 个 chunk）/);
      // 报错要指得到修法，否则下一个人只知道"红了"。
      assert.match(error.message, /barrel/);
      return true;
    }
  );
});

test('标记在整个产物里都找不到时也失败 —— 那是标记失效，不是通过', async () => {
  const files = healthyDist();
  files['chunk-wasqlite.js'] = 'const wasm="wa-sqlite-async-RENAMED.wasm";';
  const dist = await makeDist(files);

  await assert.rejects(
    () => auditDemo({ project: 'fixture', dist }),
    /wa-sqlite-async\.wasm：整个产物里都找不到 —— 标记已失效/
  );
});

test('首屏图里没有任何动态 import() 时失败', async () => {
  const dist = await makeDist({
    'index.html': INDEX_HTML,
    'main.js': 'import"./chunk-all.js";',
    // 全塞进首屏图会先被标记检查拦下，所以这里让标记一个不落地待在孤立 chunk 里，
    // 单独暴露"没有动态 import"这一种失败。
    'chunk-all.js': 'export const noop=1;',
    'chunk-orphan.js': [
      'class RxDBAdapterDesktopError extends Error{}',
      'const codes=["host_unavailable","protocol_violation","session_closed","unsupported_runtime_engine"];',
      'const ops=["file.writeBegin","file.writeChunk","file.lockAcquire"];',
      'const wasm="wa-sqlite-async.wasm";'
    ].join('\n')
  });

  await assert.rejects(() => auditDemo({ project: 'fixture', dist }), /一个动态 import\(\) 都没有/);
});

test('产物不存在时报错并给出 build 命令，而不是跳过', async () => {
  await assert.rejects(
    () => auditDemo({ project: 'dev-rxdb-electron', dist: 'dist/apps/does-not-exist' }),
    /请先执行：pnpm nx build dev-rxdb-electron/
  );
});

test('不带参数是全部 demo，带名字取子集，不认识的名字报错', () => {
  assert.deepEqual(selectDemos([]), DEMOS);
  assert.deepEqual(
    selectDemos(['dev-rxdb-tauri']).map(({ project }) => project),
    ['dev-rxdb-tauri']
  );
  assert.throws(() => selectDemos(['dev-rxdb-electorn']), /未知的 demo：dev-rxdb-electorn/);
});

test('适配器名与探针键不在标记里 —— 它们本来就该待在主 chunk', () => {
  for (const eagerByDesign of ['sqlite-electron', 'sqlite-tauri', 'wa-sqlite', '__aiaoRxdbDesktopHost__']) {
    assert.equal(LAZY_MARKERS.includes(eagerByDesign), false, eagerByDesign);
  }
});
