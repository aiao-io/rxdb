import assert from 'node:assert/strict';
import test from 'node:test';

import { AIAO_CODE_CAPABILITIES, rewriteCapabilities } from './capabilities.mjs';

const manifest = quote =>
  `vscode:{id:${quote}vscode${quote},name:${quote}Aiao Code${quote},kind:${quote}web${quote},capabilities:[${AIAO_CODE_CAPABILITIES.map(name => `${quote}${name}${quote}`).join(',')}],web:{url:${quote}https://vscode.aiao.io/${quote}}}`;
const script = (file, source) => ({ file, source });
const FULL = ['window', 'clipboard:read', 'clipboard:write', 'notification', 'filesystem:read', 'filesystem:write'];

test('只改 Aiao Code 清单里的那一个 capabilities 数组，其余字节原样保留；引号写法照原样', () => {
  for (const quote of ['`', '"', "'"]) {
    const source = `var a=1;${manifest(quote)};var b=2;`;
    const rewritten = rewriteCapabilities([script('main-X.js', source), script('chunk-Y.js', 'export{}')], FULL);
    assert.equal(rewritten.file, 'main-X.js');
    assert.deepEqual(rewritten.original, AIAO_CODE_CAPABILITIES);
    assert.equal(
      rewritten.source,
      source.replace(
        /capabilities:\[[^\]]*\]/,
        `capabilities:[${FULL.map(name => `${quote}${name}${quote}`).join(',')}]`
      )
    );
    assert.ok(rewritten.source.startsWith('var a=1;') && rewritten.source.endsWith(';var b=2;'));
  }
});

test('匹配不到就抛错，不静默通过', () => {
  assert.throws(() => rewriteCapabilities([script('main-X.js', 'var a=1;')], FULL), /恰有一处.*找到 0 处：没有/);
});

test('匹配到多处就抛错，并报出每一处在哪个文件', () => {
  assert.throws(
    () => rewriteCapabilities([script('main-X.js', manifest('`')), script('chunk-Y.js', manifest('`'))], FULL),
    /找到 2 处.*main-X\.js.*chunk-Y\.js/
  );
});

test('匹配到的不是 Aiao Code 当前的最小清单（清单已经被改过、或是别的应用的清单）就抛错', () => {
  const widened = manifest('`').replace('`clipboard:write`', '`clipboard:write`,`notification`');
  assert.throws(() => rewriteCapabilities([script('main-X.js', widened)], FULL), /不是 Aiao Code 的最小清单/);
  const other = `notes:{id:\`notes\`,name:\`Notes\`,capabilities:[\`window\`,\`clipboard:read\`,\`clipboard:write\`]}`;
  assert.throws(() => rewriteCapabilities([script('main-X.js', other)], FULL), /前面看不到 Aiao Code 的登记/);
});
