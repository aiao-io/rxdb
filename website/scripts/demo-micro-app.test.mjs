import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('demo and benchmark pages embed sub-apps through wujie, not a raw iframe', () => {
  const files = [
    'src/pages/demos/angular.tsx',
    'src/pages/demos/react.tsx',
    'src/pages/demos/vue.tsx',
    'src/pages/benchmarks.tsx'
  ];

  for (const file of files) {
    const source = readFileSync(join(root, file), 'utf8');
    assert.match(source, /DemoMicroApp/, `${file} should render DemoMicroApp`);
    assert.doesNotMatch(source, /<iframe[\s>]/, `${file} should not use a raw iframe`);
  }
});

test('wujie host wires the shared cssLoader and the theme bus', () => {
  const source = readFileSync(join(root, 'src/components/DemoMicroAppClient.tsx'), 'utf8');
  // 选择器改写的行为由 packages/utils 的 shadow-css.spec.ts 覆盖，这里只锁接线
  assert.match(source, /cssLoader:\s*rewriteShadowCss/, 'cssLoader should use the shared rewriteShadowCss');
  assert.doesNotMatch(source, /rewriteRootToHost/, 'the local :root→:host hack should be gone');
  assert.match(source, /WujieReact\.bus/);
  assert.match(source, /emitHostTheme/);
});

test('wujie host broadcasts theme changes only, initial theme rides on props', () => {
  const source = readFileSync(join(root, 'src/components/DemoMicroAppClient.tsx'), 'utf8');
  // 子应用起来之前 bus 上没有订阅者，抢跑的 $emit 只会打出「事件订阅数量为空」告警
  assert.match(
    source,
    /if\s*\(emittedTheme\.current !== next\)\s*\{[^}]*emitHostTheme\(bus, next\);/s,
    'emitHostTheme should be guarded by a change check'
  );
});

test('wujie host pushes data-theme onto the <wujie-app> element itself', () => {
  const source = readFileSync(join(root, 'src/components/DemoMicroAppClient.tsx'), 'utf8');
  // 子应用只能写到 Shadow 内的 <html>，够不到承载底色的宿主元素 —— 主题必须由外往内推
  assert.match(
    source,
    /querySelector\('wujie-app'\)/,
    'host should locate the shadow host element to carry data-theme'
  );
  assert.match(source, /setAttribute\(HOST_THEME_ATTRIBUTE/, 'host should set data-theme on the shadow host');
  // startApp 是异步的，挂载时 <wujie-app> 还不存在，必须监听它出现
  assert.match(source, /childList:\s*true/, 'host should observe the container for the async <wujie-app> insert');
});

test('sub-apps declare daisyUI root as :is(:host, :root) so standalone and Shadow DOM both get tokens', () => {
  const files = [
    '../apps/dev-rxdb-angular/src/styles.scss',
    '../apps/dev-rxdb-react/src/styles.css',
    '../apps/dev-rxdb-vue/src/styles.css',
    '../benchmarks/src/styles.css'
  ];

  for (const file of files) {
    const source = readFileSync(join(root, file), 'utf8');
    assert.match(source, /root:\s*':is\(:host, :root\)'/, `${file} should scope daisyUI to :is(:host, :root)`);
  }
});
