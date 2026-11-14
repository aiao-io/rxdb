import assert from 'node:assert/strict';
import test from 'node:test';

import { previousBuildSource } from './previous-build.mjs';

test('升级起点必须唯一而且显式指定', () => {
  assert.throws(() => previousBuildSource({}), /缺少升级起点/);
  assert.throws(() => previousBuildSource({ AIAO_DESKTOP_PREVIOUS_DIST: '/tmp/build', AIAO_DESKTOP_PREVIOUS_URL: 'https://release.example/' }), /只能指定一个/);
});

test('支持固定本地产物与 HTTPS 生产部署', () => {
  assert.deepEqual(previousBuildSource({ AIAO_DESKTOP_PREVIOUS_DIST: '/tmp/build' }), { dist: '/tmp/build' });
  assert.deepEqual(previousBuildSource({ AIAO_DESKTOP_PREVIOUS_URL: 'https://release.example/' }), { url: 'https://release.example' });
  assert.throws(() => previousBuildSource({ AIAO_DESKTOP_PREVIOUS_URL: 'http://release.example/' }), /HTTPS/);
  assert.throws(() => previousBuildSource({ AIAO_DESKTOP_PREVIOUS_URL: 'https://release.example/other' }), /根地址/);
});
