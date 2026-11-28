import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { describe, it } from 'node:test';
import { checkPorts, devPorts } from './check-ports.mjs';
import { api, dashboard, host } from './services.mjs';

/** 在随机端口上占住一个监听；测试结束时关掉。 */
async function occupy(t) {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  return server.address().port;
}

/** 取一个当前没有人监听的端口。 */
async function freePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  await new Promise(resolve => server.close(resolve));
  return port;
}

describe('nx dev 的端口检查', () => {
  it('检查开发导航与协作命令服务的固定端口（三端开发服务器自己在端口被占时失败）', () => {
    assert.deepEqual(devPorts, [
      [dashboard.name, dashboard.port, host],
      [api.name, api.port, host]
    ]);
  });

  it('端口都空闲时通过', async () => {
    assert.deepEqual(await checkPorts([['示例服务', await freePort(), '127.0.0.1']]), []);
  });

  it('被占用的端口逐个报出服务名与地址，一次报全，不换端口', async t => {
    const first = await occupy(t);
    const second = await occupy(t);
    const failures = await checkPorts([
      ['服务甲', first, '127.0.0.1'],
      ['服务乙', second, '127.0.0.1']
    ]);
    assert.equal(failures.length, 2);
    assert.match(failures[0], new RegExp(`服务甲.*127\\.0\\.0\\.1:${first}`));
    assert.match(failures[1], new RegExp(`服务乙.*127\\.0\\.0\\.1:${second}`));
    for (const message of failures) assert.match(message, /不会切换端口/);
  });
});
