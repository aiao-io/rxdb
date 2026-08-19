import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const DEMOS = ['angular', 'react', 'vue'];

test('demo and benchmark pages embed sub-apps through wujie, not a raw iframe', () => {
  // demo 页组件不在 src/pages 下：pages 插件只生成 exact 路由，匹配不到 /demos/vue/todo
  const files = [...DEMOS.map(demo => `src/demos/${demo}.tsx`), 'src/pages/benchmarks.tsx'];

  for (const file of files) {
    const source = readFileSync(join(root, file), 'utf8');
    assert.match(source, /DemoMicroApp/, `${file} should render DemoMicroApp`);
    assert.doesNotMatch(source, /<iframe[\s>]/, `${file} should not use a raw iframe`);
  }
});

test('demo pages hand the host their own path prefix so routes can be synced', () => {
  for (const demo of DEMOS) {
    const source = readFileSync(join(root, `src/demos/${demo}.tsx`), 'utf8');
    assert.match(source, new RegExp(`basePath='/demos/${demo}'`), `src/demos/${demo}.tsx should pass basePath`);
  }
});

test('demo routes are registered as non-exact so sub-app paths land on the same page', () => {
  const source = readFileSync(join(root, 'src/plugins/demo-routes.js'), 'utf8');
  assert.match(source, /exact:\s*false/, 'demo routes must not be exact');
  assert.match(source, /@site\/src\/demos\//, 'the plugin should own the components moved out of src/pages');

  const config = readFileSync(join(root, 'docusaurus.config.ts'), 'utf8');
  assert.match(config, /demo-routes\.js/, 'docusaurus.config.ts should register the demo routes plugin');
});

test('static hosting falls back to the demo host page for deep links', () => {
  const source = readFileSync(join(root, 'public/_redirects'), 'utf8');
  for (const demo of DEMOS) {
    // trailingSlash: false 产出的是 demos/<name>.html，不是目录，所以目标写全文件名
    assert.match(
      source,
      new RegExp(`/demos/${demo}/\\*\\s+/demos/${demo}\\.html\\s+200`),
      `_redirects should rewrite /demos/${demo}/* to the built page`
    );
  }
});

test('wujie host syncs routes in both directions behind the shared protocol', () => {
  const source = readFileSync(join(root, 'src/components/DemoMicroAppClient.tsx'), 'utf8');
  // 协议本身（归一化、name 过滤、TTL 闸门）由 modules/wujie 的 host-route.spec.ts 覆盖，这里只锁接线
  assert.match(source, /useLocation/, 'host should read its own pathname from the Docusaurus router');
  assert.match(source, /emitHostRoute\(bus, name/, 'host should push its path down to the sub-app');
  assert.match(source, /subscribeSubRoute/, 'host should subscribe to the sub-app route reports');
  assert.match(source, /HostRouteSync/, 'host should gate reports through the TTL sync lock');
  // 裸 replaceState 不更新 react-router 的内部 location，useLocation() 会停在旧路径
  assert.match(source, /useHistory/, 'host should write back through the Docusaurus history');
  // 子应用的返回栈由无界代理的 iframe history 维护，宿主再 push 会双份
  assert.match(source, /history\.replace\(next\)/, 'host should replace rather than push its URL');
  assert.doesNotMatch(source, /history\.replaceState/, 'host must not bypass react-router with raw replaceState');
  // 子应用起来之前 bus 上没有订阅者，初始路径必须搭 props 进去
  assert.match(source, /route:\s*initialRoute\.current/, 'initial route should ride on props');
});

test('sub-apps bind the wujie route adapter at bootstrap', () => {
  const files = [
    '../apps/dev-rxdb-angular/src/main.ts',
    '../apps/dev-rxdb-react/src/main.tsx',
    '../apps/dev-rxdb-vue/src/main.ts'
  ];

  for (const file of files) {
    const source = readFileSync(join(root, file), 'utf8');
    assert.match(source, /bindWujieRoute/, `${file} should bind the shared route adapter`);
  }
});

test('wujie host wires the shared cssLoader and the theme bus', () => {
  const source = readFileSync(join(root, 'src/components/DemoMicroAppClient.tsx'), 'utf8');
  // 选择器改写的行为由 modules/wujie 的 shadow-css.spec.ts 覆盖，这里只锁接线
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
