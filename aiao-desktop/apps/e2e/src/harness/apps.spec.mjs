import assert from 'node:assert/strict';
import test from 'node:test';

import { compareApps } from './apps.mjs';

const declared = { opened: ['finder', 'safari'], elsewhere: ['vscode'] };

test('启动台条目与冒烟声明一致时没有差异', () => {
  const entries = [{ id: 'finder' }, { id: 'safari' }, { id: 'vscode' }];
  assert.deepEqual(compareApps(entries, declared), { uncovered: [], unknown: [] });
});

test('登记表新增了应用而冒烟没覆盖：指出应用 id', () => {
  const entries = [{ id: 'finder' }, { id: 'safari' }, { id: 'vscode' }, { id: 'newapp' }];
  assert.deepEqual(compareApps(entries, declared), { uncovered: ['newapp'], unknown: [] });
});

test('冒烟里多出登记表没有的应用：指出应用 id', () => {
  const entries = [{ id: 'finder' }, { id: 'vscode' }];
  assert.deepEqual(compareApps(entries, declared), { uncovered: [], unknown: ['safari'] });
});

test('两种差异同时出现时都列出', () => {
  const entries = [{ id: 'finder' }, { id: 'extra' }];
  assert.deepEqual(compareApps(entries, declared), { uncovered: ['extra'], unknown: ['safari', 'vscode'] });
});
