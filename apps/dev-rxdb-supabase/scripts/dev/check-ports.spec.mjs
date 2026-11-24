import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { test } from 'node:test';
import { assertPortFree, checkPorts } from './check-ports.mjs';

const lsofMissing = spawnSync('lsof', ['-v']).error !== undefined && 'lsof is not installed';

async function occupy(host, port = 0) {
  const owner = createServer();
  owner.listen(port, host);
  await once(owner, 'listening');
  return { owner, port: owner.address().port };
}

const release = owner => new Promise((resolve, reject) => owner.close(error => (error ? reject(error) : resolve())));

const ipv6Loopback = await occupy('::1').then(
  ({ owner }) => release(owner).then(() => true),
  () => false
);

// macOS 上通配地址与回环地址可以同时监听同一端口：只试着 listen 一个地址会放过 localhost 已被别的服务占住的情况
for (const host of ['127.0.0.1', '0.0.0.0']) {
  test(`监听在 ${host} 的固定端口按已占用报出，提示不换号`, async () => {
    const { owner, port } = await occupy(host);
    try {
      await assert.rejects(assertPortFree('应用 dev server', port), error => {
        assert.match(error.message, new RegExp(`应用 dev server.*${port}`));
        assert.match(error.message, /不会切换端口/);
        return true;
      });
      assert.ok(owner.listening);
    } finally {
      await release(owner);
    }
  });
}

test('只监听 ::1 的服务同样按已占用报出', { skip: !ipv6Loopback && 'IPv6 loopback is unavailable' }, async () => {
  const { owner, port } = await occupy('::1');
  try {
    await assert.rejects(assertPortFree('测试起始页', port), /测试起始页/);
  } finally {
    await release(owner);
  }
});

test('报出占用进程的 pid 与目录', { skip: lsofMissing }, async () => {
  const { owner, port } = await occupy('127.0.0.1');
  try {
    await assert.rejects(assertPortFree('测试起始页', port), error => {
      assert.match(error.message, new RegExp(`pid ${process.pid}\\b`));
      assert.ok(error.message.includes(process.cwd()));
      return true;
    });
  } finally {
    await release(owner);
  }
});

test('一次检查列出所有被占的固定端口，空闲的放行且检查本身不占住端口', async () => {
  const [app, dashboard, spare] = [await occupy('127.0.0.1'), await occupy('0.0.0.0'), await occupy('127.0.0.1')];
  await release(spare.owner);
  try {
    const failures = await checkPorts([
      ['应用 dev server', app.port],
      ['空闲端口', spare.port],
      ['测试起始页', dashboard.port]
    ]);
    assert.equal(failures.length, 2);
    assert.match(failures[0], /应用 dev server/);
    assert.match(failures[1], /测试起始页/);
  } finally {
    await Promise.all([release(app.owner), release(dashboard.owner)]);
  }
  const reopened = await occupy('127.0.0.1', spare.port);
  await release(reopened.owner);
});
