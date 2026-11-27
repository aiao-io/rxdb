import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer, Socket } from 'node:net';
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

test('连接迟迟没有回应（防火墙丢了 SYN）：到点报无法确认，不挂上一分多钟', async () => {
  // 永远连不上也不报错的套接字：本机系统的连接超时约 75 秒
  const silent = () => new Socket();
  const started = Date.now();
  await assert.rejects(assertPortFree('应用 dev server', 4203, { timeout: 50, connect: silent }), error => {
    assert.match(error.message, /无法确认应用 dev server 的固定端口 4203 是否空闲/);
    assert.match(error.message, /超过 50 毫秒没有回应/);
    return true;
  });
  assert.ok(Date.now() - started < 2000);
});

test('白名单外的连接错误：报无法确认与错误码，不冒充成端口被占用', async () => {
  const denied = () => {
    const socket = new Socket();
    setImmediate(() => socket.emit('error', Object.assign(new Error('connect EPERM'), { code: 'EPERM' })));
    return socket;
  };
  await assert.rejects(assertPortFree('测试起始页', 4204, { connect: denied }), error => {
    assert.match(error.message, /无法确认测试起始页 的固定端口 4204 是否空闲/);
    assert.match(error.message, /EPERM/);
    assert.doesNotMatch(error.message, /已被占用/);
    return true;
  });
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
