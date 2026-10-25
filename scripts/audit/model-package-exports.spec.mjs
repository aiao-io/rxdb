import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import semver from 'semver';

const manifestOf = name =>
  JSON.parse(readFileSync(new URL(`../../packages/${name}/package.json`, import.meta.url), 'utf8'));

const rxdbManifest = manifestOf('rxdb');
const modelManifest = manifestOf('rxdb-model');
const angularManifest = manifestOf('rxdb-model-angular');

const bindingManifest = manifestOf('rxdb-angular');

/**
 * US-602 A2 之后 `@aiao/*` peer 统一为 `workspace:^`，发布时改写成 `^<该包工作区版本>`。
 * 语义断言按改写后的范围算，而不是拿 semver 直接解析 `workspace:^`。
 */
const peerRange = (manifest, name) => {
  const range = manifest.peerDependencies[name];
  return range === 'workspace:^' ? `^${manifestOf(name.replace('@aiao/', '')).version}` : range;
};

test('Angular model 的 APF 入口由 ng-packagr 生成，不能保留不存在的 dist/index.js 条件', () => {
  assert.equal(angularManifest.exports['.'], undefined);
  assert.equal(angularManifest.exports['./package.json'], undefined);
});

test('Angular model 的 Tailwind 扫描入口保留为独立资源导出', () => {
  assert.equal(angularManifest.exports['./tailwind.css'], './tailwind.css');
  assert.ok(readFileSync(new URL('../../packages/rxdb-model-angular/tailwind.css', import.meta.url), 'utf8').trim());
});

test('React / Vue model 的编译样式 bundle 都以 ./index.css 导出（Angular 组件样式随 APF 编进组件）', () => {
  // vite lib 模式把组件样式（React 的 css import、Vue SFC 的 scoped <style>）抽成 dist/index.css，
  // JS 产物不引用它；不在 exports 里，消费方就无从引入，对话框定位 / resize 把手 / 表格尺寸全丢
  for (const framework of ['react', 'vue']) {
    const manifest = JSON.parse(
      readFileSync(new URL(`../../packages/rxdb-model-${framework}/package.json`, import.meta.url), 'utf8')
    );
    assert.equal(manifest.exports['./index.css'], './dist/index.css', `rxdb-model-${framework}`);
    assert.ok(manifest.files.includes('dist'), `rxdb-model-${framework} 的 files 必须带上 dist`);
  }
});

test('框架无关的 model 公开运行时入口保持为构建产物', () => {
  assert.equal(modelManifest.exports['.'].import, './dist/index.js');
  assert.equal(modelManifest.exports['.'].default, './dist/index.js');
  assert.equal(modelManifest.exports['.'].types, './dist/index.d.ts');
});

test('Angular model 排除旧 binding 与旧 model，明确支持本次发布组合', () => {
  assert.ok(semver.satisfies(bindingManifest.version, peerRange(angularManifest, '@aiao/rxdb-angular')));
  assert.equal(semver.satisfies('0.0.26', peerRange(angularManifest, '@aiao/rxdb-angular')), false);
  assert.ok(semver.satisfies(modelManifest.version, peerRange(angularManifest, '@aiao/rxdb-model')));
  assert.equal(semver.satisfies('0.0.19', peerRange(angularManifest, '@aiao/rxdb-model')), false);
  assert.ok(semver.satisfies(rxdbManifest.version, peerRange(angularManifest, '@aiao/rxdb')));
  assert.equal(semver.satisfies('0.0.25', peerRange(angularManifest, '@aiao/rxdb')), false);
});

test('新 binding 排除旧 RxDB，并与 Angular model 使用同一 Angular 版本', () => {
  assert.ok(semver.satisfies(rxdbManifest.version, peerRange(bindingManifest, '@aiao/rxdb')));
  assert.equal(semver.satisfies('0.0.25', peerRange(bindingManifest, '@aiao/rxdb')), false);
  assert.equal(bindingManifest.peerDependencies['@angular/core'], angularManifest.peerDependencies['@angular/core']);
  assert.equal(
    bindingManifest.peerDependencies['@angular/platform-browser'],
    angularManifest.peerDependencies['@angular/platform-browser']
  );
});
