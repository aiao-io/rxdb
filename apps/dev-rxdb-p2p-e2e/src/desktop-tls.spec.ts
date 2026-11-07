import { expect, test } from '@playwright/test';
import { PeerProcess } from './desktop/peer-process.ts';
import type { FileSpec, PeerName } from './shared/fixtures.ts';

/** 三个大小、块大小各不相同的文件；最大的一个跨六十多个块。 */
const FILES: readonly FileSpec[] = [
  { seed: 1, size: 3 * 1024 * 1024 + 123, chunkSize: 48 * 1024 },
  { seed: 2, size: 1024 * 1024 + 7, chunkSize: 64 * 1024 },
  { seed: 3, size: 512 * 1024, chunkSize: 1024 * 1024 }
];

const spawned: PeerProcess[] = [];

const spawn = (name: PeerName, flags: readonly string[] = []): PeerProcess => {
  const peer = new PeerProcess(name, flags);
  spawned.push(peer);
  return peer;
};

/** 派生两个对端进程：bob 监听、alice 拨号，双方会话就绪后返回。 */
const connectedPair = async (flags: { readonly alice?: readonly string[]; readonly bob?: readonly string[] } = {}) => {
  const bob = spawn('bob', flags.bob);
  const alice = spawn('alice', flags.alice);
  const { port } = await bob.call({ method: 'listen' });
  await alice.call({ method: 'connect', port });
  await expect(Promise.all([alice.call({ method: 'ready' }), bob.call({ method: 'ready' })])).resolves.toEqual([
    { peer: 'bob' },
    { peer: 'alice' }
  ]);
  return { alice, bob };
};

test.afterEach(() => {
  for (const peer of spawned.splice(0)) peer.kill();
});

test.describe('US-708 AC#10：两个桌面进程经 TLS socket 建立会话', () => {
  test('AC#1：一条会话上并发拉取 3 个文件，字节与各自清单一致，全程只有一条 TLS 连接', async () => {
    const { alice, bob } = await connectedPair();
    const { manifests } = await bob.call({ method: 'hold', files: FILES });
    const { files } = await alice.call({ method: 'pull', manifests });
    expect(files.map(file => file.digest)).toEqual(manifests.map(manifest => manifest.contentHash));
    expect(files.map(file => file.size)).toEqual(FILES.map(spec => spec.size));
    expect((await bob.call({ method: 'stats' })).connections).toBe(1);
    expect((await alice.call({ method: 'stats' })).connections).toBe(1);
  });

  test('AC#2：同一条会话上，双方同时互相拉取对方持有的文件', async () => {
    const { alice, bob } = await connectedPair();
    const [aliceHolds, bobHolds] = await Promise.all([
      alice.call({ method: 'hold', files: [FILES[0]] }),
      bob.call({ method: 'hold', files: [FILES[1]] })
    ]);
    const [fromBob, fromAlice] = await Promise.all([
      alice.call({ method: 'pull', manifests: bobHolds.manifests }),
      bob.call({ method: 'pull', manifests: aliceHolds.manifests })
    ]);
    expect(fromBob.files.map(file => file.digest)).toEqual(bobHolds.manifests.map(manifest => manifest.contentHash));
    expect(fromAlice.files.map(file => file.digest)).toEqual(
      aliceHolds.manifests.map(manifest => manifest.contentHash)
    );
  });

  test('AC#3：请求对端不支持的协议得到 unsupported，会话保持，并行的文件传输照常完成', async () => {
    const { alice, bob } = await connectedPair({ alice: ['--probe'] });
    const { manifests } = await bob.call({ method: 'hold', files: [FILES[0]], readDelayMs: 5 });
    const pulling = alice.call({ method: 'pull', manifests });
    await expect(alice.call({ method: 'probe', protocol: 'acceptance.probe' })).resolves.toEqual({
      code: 'unsupported'
    });
    const { files } = await pulling;
    expect(files[0].digest).toBe(manifests[0].contentHash);
    expect((await alice.call({ method: 'stats' })).state).toBe('ready');
  });

  test('AC#4：请求方取消后，供块端收到取消即不再读取该区间', async () => {
    const { alice, bob } = await connectedPair();
    const { manifests } = await bob.call({ method: 'hold', files: [FILES[1]] });
    await bob.call({ method: 'gate-authorize' });
    await alice.call({ method: 'start-request', manifest: manifests[0] });
    await bob.nextEvent('authorize-waiting');
    await expect(alice.call({ method: 'cancel-request' })).resolves.toEqual({
      outcome: 'cancelled by the acceptance test'
    });
    // 取消帧经 TLS 到达供块端之后才开闸：验收的是「收到取消后」不再读盘。
    await bob.nextEvent('authorize-cancelled');
    await bob.call({ method: 'release-authorize' });
    // 放行之后留出足够的时间：取消若没有生效，供块端会在这段时间里读盘并回包。
    await new Promise(resolve => setTimeout(resolve, 500));
    expect(await bob.call({ method: 'stats' })).toMatchObject({ reads: 0, authorizeCalls: 1, state: 'ready' });
    const { files } = await alice.call({ method: 'pull', manifests });
    expect(files[0].digest).toBe(manifests[0].contentHash);
  });
});
