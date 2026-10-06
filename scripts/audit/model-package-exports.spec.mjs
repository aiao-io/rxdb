import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import semver from 'semver';

const modelManifest = JSON.parse(
  readFileSync(new URL('../../packages/rxdb-model/package.json', import.meta.url), 'utf8')
);
const angularManifest = JSON.parse(
  readFileSync(new URL('../../packages/rxdb-model-angular/package.json', import.meta.url), 'utf8')
);

const bindingManifest = JSON.parse(
  readFileSync(new URL('../../packages/rxdb-angular/package.json', import.meta.url), 'utf8')
);

test('Angular model 的 APF 入口由 ng-packagr 生成，不能保留不存在的 dist/index.js 条件', () => {
  assert.equal(angularManifest.exports['.'], undefined);
  assert.equal(angularManifest.exports['./package.json'], undefined);
});

test('Angular model 的 Tailwind 扫描入口保留为独立资源导出', () => {
  assert.equal(angularManifest.exports['./tailwind.css'], './tailwind.css');
  assert.ok(readFileSync(new URL('../../packages/rxdb-model-angular/tailwind.css', import.meta.url), 'utf8').trim());
});

test('框架无关的 model 公开运行时入口保持为构建产物', () => {
  assert.equal(modelManifest.exports['.'].import, './dist/index.js');
  assert.equal(modelManifest.exports['.'].default, './dist/index.js');
  assert.equal(modelManifest.exports['.'].types, './dist/index.d.ts');
});

test('Angular model 排除旧 binding 与旧 model，明确支持本次发布组合', () => {
  assert.ok(semver.satisfies(bindingManifest.version, angularManifest.peerDependencies['@aiao/rxdb-angular']));
  assert.equal(semver.satisfies('0.0.26', angularManifest.peerDependencies['@aiao/rxdb-angular']), false);
  assert.ok(semver.satisfies('0.0.26', angularManifest.peerDependencies['@aiao/rxdb-model']));
  assert.equal(semver.satisfies('0.0.19', angularManifest.peerDependencies['@aiao/rxdb-model']), false);
  assert.ok(semver.satisfies('0.0.26', angularManifest.peerDependencies['@aiao/rxdb']));
  assert.equal(semver.satisfies('0.0.25', angularManifest.peerDependencies['@aiao/rxdb']), false);
});

test('新 binding 排除旧 RxDB，并与 Angular model 使用同一 Angular 版本', () => {
  assert.ok(semver.satisfies('0.0.26', bindingManifest.peerDependencies['@aiao/rxdb']));
  assert.equal(semver.satisfies('0.0.25', bindingManifest.peerDependencies['@aiao/rxdb']), false);
  assert.equal(bindingManifest.peerDependencies['@angular/core'], angularManifest.peerDependencies['@angular/core']);
  assert.equal(
    bindingManifest.peerDependencies['@angular/platform-browser'],
    angularManifest.peerDependencies['@angular/platform-browser']
  );
});
