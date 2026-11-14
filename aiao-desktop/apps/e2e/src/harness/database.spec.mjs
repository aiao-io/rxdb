import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { tableCounts } from './database.mjs';

async function fixture(run, { fail = false } = {}) {
  const distRoot = await mkdtemp(join(tmpdir(), 'desktop-counts-'));
  const calls = { opened: 0, disconnected: 0, closed: 0, sql: [] };
  await writeFile(join(distRoot, 'main.js'), 'new Worker(new URL(`worker-db.js`,import.meta.url))');
  const page = {
    async route(url, handler) {
      assert.equal(url, 'https://desktop.example/__sqlite-shell__');
      assert.equal(typeof handler, 'function');
    },
    async goto(url) {
      assert.equal(url, 'https://desktop.example/__sqlite-shell__');
    },
    async evaluate(_callback, argument) {
      if (typeof argument === 'string') return;
      if (!Array.isArray(argument)) {
        calls.disconnected++;
        return;
      }
      const [sql] = argument;
      calls.sql.push(sql);
      if (fail) throw new Error('database read failed');
      return { results: [{ rows: [[calls.sql.length === 2 ? 0 : 3]] }] };
    },
    async close() {
      calls.closed++;
    }
  };
  const session = {
    distRoot,
    origin: 'https://desktop.example',
    context: {
      async newPage() {
        calls.opened++;
        assert.equal(calls.opened, 1, '一批表计数只能打开一个临时数据库连接');
        return page;
      }
    }
  };
  try {
    await run(session, calls);
  } finally {
    await rm(distRoot, { recursive: true });
  }
}

test('一批种子表计数复用一个连接，按输入顺序返回行数，零行不伪装成已种数据', () =>
  fixture(async (session, calls) => {
    assert.deepEqual(
      await tableCounts(session, ['desktop$calendar_event', 'desktop$reminder', 'desktop$weather_city']),
      [3, 0, 3]
    );
    assert.equal(calls.opened, 1);
    assert.equal(calls.disconnected, 1);
    assert.equal(calls.closed, 1);
    assert.deepEqual(calls.sql, [
      'SELECT count(*) FROM "desktop$calendar_event"',
      'SELECT count(*) FROM "desktop$reminder"',
      'SELECT count(*) FROM "desktop$weather_city"'
    ]);
  }));

test('表名仍由数据库夹具引用，不拼接未转义的标识符', () =>
  fixture(async (session, calls) => {
    assert.deepEqual(await tableCounts(session, ['a"b']), [3]);
    assert.deepEqual(calls.sql, ['SELECT count(*) FROM "a""b"']);
  }));

test('读取失败原样抛出，仍断开唯一连接并关闭临时页面，不通过重试掩盖错误', () =>
  fixture(
    async (session, calls) => {
      await assert.rejects(tableCounts(session, ['desktop$reminder']), /database read failed/);
      assert.equal(calls.opened, 1);
      assert.equal(calls.disconnected, 1);
      assert.equal(calls.closed, 1);
    },
    { fail: true }
  ));
