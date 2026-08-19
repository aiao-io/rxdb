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

test('wujie host applies theme change requests coming back from the sub-app', () => {
  const source = readFileSync(join(root, 'src/components/DemoMicroAppClient.tsx'), 'utf8');
  // 子应用里切主题要能带动整个文档站，回推走独立的 request 事件，不与下发通道共用
  assert.match(source, /subscribeThemeRequest/, 'host should subscribe to sub-app theme requests');
  // 直接 setAttribute 会被 Docusaurus 的 colorMode 状态覆盖，也不会持久化
  assert.match(source, /useColorMode/, 'host should write back through the Docusaurus colorMode API');
  assert.match(source, /setColorMode/, 'host should apply the requested theme via setColorMode');
});

test('sub-apps push theme changes back to the host on user-driven switches only', () => {
  const files = [
    '../modules/angular/src/services/theme.service.ts',
    '../apps/dev-rxdb-react/src/app/hooks/useTheme.ts',
    '../apps/dev-rxdb-vue/src/app/composables/useTheme.ts',
    '../benchmarks/src/hooks/useTheme.ts'
  ];

  for (const file of files) {
    const source = readFileSync(join(root, file), 'utf8');
    assert.match(source, /requestHostTheme/, `${file} should push user-driven theme changes to the host`);
    // 回推必须留在用户动作路径上；写进 subscribeHostTheme 的回调就成环了
    assert.doesNotMatch(
      source,
      /subscribeHostTheme\([^)]*requestHostTheme/s,
      `${file} must not echo the host theme back to the host`
    );
  }
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
