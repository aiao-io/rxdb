import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { HARNESS_PORT, PROBE_PROTOCOL, type Harness, type HarnessOptions } from './browser/harness-api.ts';
import { credentialFor, PEERS, type FileSpec } from './shared/fixtures.ts';

const HARNESS_URL = `http://127.0.0.1:${HARNESS_PORT}/`;

/** 三个大小、块大小各不相同的文件；最大的一个跨六十多个块。 */
const FILES: readonly FileSpec[] = [
  { seed: 1, size: 3 * 1024 * 1024 + 123, chunkSize: 48 * 1024 },
  { seed: 2, size: 1024 * 1024 + 7, chunkSize: 64 * 1024 },
  { seed: 3, size: 512 * 1024, chunkSize: 1024 * 1024 }
];

type Method = keyof Harness;
type Result<M extends Method> = Awaited<ReturnType<Harness[M]>>;

/** 在某个上下文的夹具页里调用 `window.p2pHarness[method]`。 */
const call = <M extends Method>(page: Page, method: M, ...args: Parameters<Harness[M]>): Promise<Result<M>> =>
  page.evaluate(
    ([name, params]) => (window.p2pHarness[name] as (...values: readonly unknown[]) => unknown)(...params),
    [method, args] as const
  ) as Promise<Result<M>>;

const contexts: BrowserContext[] = [];

test.afterEach(async () => {
  await Promise.all(contexts.splice(0).map(context => context.close()));
});

/** 新开一个浏览器上下文（模拟一台设备）并加载夹具页。 */
const openPeer = async (browser: Browser, options: HarnessOptions): Promise<Page> => {
  const context = await browser.newContext();
  contexts.push(context);
  const page = await context.newPage();
  await page.goto(HARNESS_URL);
  await page.waitForFunction(() => 'p2pHarness' in window);
  await call(page, 'configure', options);
  return page;
};

/** 在两个上下文之间搬运一次 SDP：offer → answer。 */
const connect = async (initiator: Page, responder: Page, connectionId: string, credential?: string): Promise<void> => {
  const offer = await call(initiator, 'createOffer', connectionId, credential);
  const answer = await call(responder, 'acceptOffer', connectionId, offer);
  await call(initiator, 'acceptAnswer', connectionId, answer);
};

/** alice 与 bob 两个上下文，经 c1 建立会话并都已就绪。 */
const connectedPair = async (
  browser: Browser,
  alice: Partial<HarnessOptions> = {},
  bob: Partial<HarnessOptions> = {}
): Promise<{ readonly alice: Page; readonly bob: Page }> => {
  const pages = await Promise.all([
    openPeer(browser, { ...alice, name: 'alice' }),
    openPeer(browser, { ...bob, name: 'bob' })
  ]);
  await connect(pages[0], pages[1], 'c1');
  await expect(Promise.all([call(pages[0], 'ready', 'c1'), call(pages[1], 'ready', 'c1')])).resolves.toEqual([
    { ok: true, peer: 'bob' },
    { ok: true, peer: 'alice' }
  ]);
  return { alice: pages[0], bob: pages[1] };
};

test.describe('US-708：两个浏览器上下文经真实 WebRTC DataChannel 建立会话', () => {
  test('AC#1：一条会话上并发拉取 3 个文件，字节与各自清单一致，全程只有 1 次 SDP 交换', async ({ browser }) => {
    const { alice, bob } = await connectedPair(browser);
    const manifests = await call(bob, 'hold', FILES);
    const pulled = await call(alice, 'pull', 'c1', manifests);
    expect(pulled.map(file => file.digest)).toEqual(manifests.map(manifest => manifest.contentHash));
    const [aliceStats, bobStats] = await Promise.all([call(alice, 'stats'), call(bob, 'stats')]);
    expect([aliceStats.offers + bobStats.offers, aliceStats.answers + bobStats.answers]).toEqual([1, 1]);
  });

  test('AC#2：同一条会话上，双方同时互相拉取对方持有的文件', async ({ browser }) => {
    const { alice, bob } = await connectedPair(browser);
    const [aliceHolds, bobHolds] = await Promise.all([call(alice, 'hold', [FILES[0]]), call(bob, 'hold', [FILES[1]])]);
    const [fromBob, fromAlice] = await Promise.all([
      call(alice, 'pull', 'c1', bobHolds),
      call(bob, 'pull', 'c1', aliceHolds)
    ]);
    expect(fromBob.map(file => file.digest)).toEqual(bobHolds.map(manifest => manifest.contentHash));
    expect(fromAlice.map(file => file.digest)).toEqual(aliceHolds.map(manifest => manifest.contentHash));
  });

  test('AC#3：请求对端不支持的协议得到 unsupported，会话保持，并行的文件传输照常完成', async ({ browser }) => {
    const { alice, bob } = await connectedPair(browser, { probe: true });
    const [file] = await call(bob, 'hold', [FILES[0]], 5);
    await call(alice, 'startPull', 'c1', [file]);
    await call(alice, 'waitPulledChunks', 1);
    expect(await call(alice, 'probe', 'c1', PROBE_PROTOCOL)).toMatchObject({ ok: false, code: 'unsupported' });
    const [pulled] = await call(alice, 'finishPull');
    expect(pulled.digest).toBe(file.contentHash);
    expect((await call(alice, 'stats')).states).toEqual({ c1: 'ready' });
  });

  test('AC#4：请求方取消后，供块端收到取消即不再读取该区间', async ({ browser }) => {
    const { alice, bob } = await connectedPair(browser);
    const [file] = await call(bob, 'hold', [FILES[1]]);
    await call(bob, 'gateAuthorize');
    await call(alice, 'startRequest', 'c1', file);
    await call(bob, 'authorizeWaiting');
    expect(await call(alice, 'cancelRequest')).toBe('cancelled by the acceptance test');
    // 取消帧经 DataChannel 到达供块端之后才开闸：验收的是「收到取消后」不再读盘。
    await call(bob, 'authorizeCancelled');
    await call(bob, 'releaseAuthorize');
    // 放行之后留出足够的时间：取消若没有生效，供块端会在这段时间里读盘并回包。
    await new Promise(resolve => setTimeout(resolve, 500));
    expect(await call(bob, 'stats')).toMatchObject({ reads: 0, authorizeCalls: 1 });
    const [pulled] = await call(alice, 'pull', 'c1', [file]);
    expect(pulled.digest).toBe(file.contentHash);
  });

  test('AC#5：对端卡死不再应答心跳，本端在心跳超时内以 peer_lost 结束会话并从会话列表移除', async ({ browser }) => {
    const heartbeat = { heartbeatIntervalMs: 200, heartbeatTimeoutMs: 800 };
    const { alice, bob } = await connectedPair(browser, heartbeat, heartbeat);
    expect((await call(alice, 'stats')).sessions).toEqual(['c1']);
    const started = Date.now();
    // 卡住对端页面的主线程：DataChannel 与 SCTP 都还在，只是再也没有心跳应答——等同于对端断网。
    void bob
      .evaluate(() => {
        const until = Date.now() + 20_000;
        while (Date.now() < until) {
          // 忙等
        }
      })
      .catch(() => undefined);
    expect(await call(alice, 'closed', 'c1')).toMatchObject({ code: 'peer_lost' });
    expect(Date.now() - started).toBeLessThan(5_000);
    expect((await call(alice, 'stats')).sessions).toEqual([]);
  });

  test('AC#5：关闭对端上下文，本端不等下一次请求失败即结束会话，并从会话列表移除', async ({ browser }) => {
    const heartbeat = { heartbeatIntervalMs: 200, heartbeatTimeoutMs: 800 };
    const { alice, bob } = await connectedPair(browser, heartbeat, heartbeat);
    await bob.context().close();
    const closed = await call(alice, 'closed', 'c1');
    expect(['peer_lost', 'transport_failed']).toContain(closed.code);
    expect((await call(alice, 'stats')).sessions).toEqual([]);
  });

  test('AC#6：对端凭据未通过认证，在 hello 阶段被拒，拒绝原因不含本端持有的任何内容', async ({ browser }) => {
    const [alice, bob] = await Promise.all([openPeer(browser, { name: 'alice' }), openPeer(browser, { name: 'bob' })]);
    const [file] = await call(bob, 'hold', [FILES[0]]);
    // 截获的凭据重放到另一条连接上：认证宿主签发给 another-connection 的 token。
    await connect(alice, bob, 'c1', credentialFor(PEERS.alice, 'another-connection'));
    const [aliceClosed, bobReady] = await Promise.all([call(alice, 'closed', 'c1'), call(bob, 'ready', 'c1')]);
    expect(bobReady).toMatchObject({ ok: false, code: 'unauthorized' });
    expect(aliceClosed).toMatchObject({ code: 'peer_closed', peerReason: 'unauthorized' });
    expect(JSON.stringify([aliceClosed, bobReady])).not.toContain(file.contentHash);
    expect(await call(bob, 'stats')).toMatchObject({ reads: 0, authorizeCalls: 0, sessions: [] });
  });

  test('AC#7：请求本端未持有、或未授权给对端的内容被拒并给出原因，会话不断，其它内容照常', async ({ browser }) => {
    const [alice, bob] = await Promise.all([openPeer(browser, { name: 'alice' }), openPeer(browser, { name: 'bob' })]);
    const [shared, secret] = await call(bob, 'hold', [FILES[0], FILES[1]]);
    const [missing] = await call(alice, 'hold', [FILES[2]]);
    await call(bob, 'configure', { name: 'bob', denied: [secret.contentHash] });
    await connect(alice, bob, 'c1');
    await expect(call(alice, 'ready', 'c1')).resolves.toEqual({ ok: true, peer: 'bob' });
    expect(await call(alice, 'requestChunk', 'c1', missing)).toMatchObject({ ok: false, code: 'not_holder' });
    expect(await call(alice, 'requestChunk', 'c1', secret)).toMatchObject({
      ok: false,
      code: 'unauthorized',
      message: 'content is not shared with this peer'
    });
    const [pulled] = await call(alice, 'pull', 'c1', [shared]);
    expect(pulled.digest).toBe(shared.contentHash);
    expect((await call(alice, 'stats')).states).toEqual({ c1: 'ready' });
  });

  test('AC#8：两端同时向对方发起连接，最终只保留一条会话，两端认定的是同一条', async ({ browser }) => {
    const [alice, bob] = await Promise.all([openPeer(browser, { name: 'alice' }), openPeer(browser, { name: 'bob' })]);
    await Promise.all([connect(alice, bob, 'alice-dials'), connect(bob, alice, 'bob-dials')]);
    await expect
      .poll(async () => [(await call(alice, 'stats')).sessions, (await call(bob, 'stats')).sessions])
      .toEqual([['alice-dials'], ['alice-dials']]);
    const losers = await Promise.all([call(alice, 'closed', 'bob-dials'), call(bob, 'closed', 'bob-dials')]);
    for (const loser of losers) expect([loser.code, loser.peerReason]).toContain('duplicate');
  });

  test('AC#9：大文件传输进行中，同一会话上后发的小请求先于已入队的批量块发出', async ({ browser }) => {
    const { alice, bob } = await connectedPair(browser, { probe: true }, { probe: true });
    const [big] = await call(bob, 'hold', [{ seed: 9, size: 16 * 1024 * 1024, chunkSize: 1024 * 1024 }]);
    // 关上 bob 的发送闸：第一个批量应答停在闸口，其余 7 个排进会话的发送队列（alice 并发 8 个块请求）。
    await call(bob, 'gateSends');
    await call(alice, 'startPull', 'c1', [big], 8);
    await expect.poll(async () => (await call(bob, 'stats')).reads).toBe(8);
    const probing = call(alice, 'probe', 'c1', PROBE_PROTOCOL);
    await expect.poll(async () => (await call(bob, 'stats')).probes).toBe(1);
    await call(bob, 'releaseSends');
    expect(await probing).toEqual({ ok: true });
    const [pulled] = await call(alice, 'finishPull');
    expect(pulled.digest).toBe(big.contentHash);
    // 按交给 DataChannel 的先后核对：闸口那一帧之后紧跟小应答，排在队列里的 7 个批量块都在它之后。
    const responses = (await call(bob, 'trace', 'c1')).filter(entry => entry.kind === 'response');
    const pong = responses.findIndex(entry => entry.result === 'pong');
    const pongId = Number(responses[pong]?.id);
    const overtaken = responses.slice(pong + 1).filter(entry => entry.payloadBytes > 0 && Number(entry.id) < pongId);
    expect(pong).toBe(1);
    expect(overtaken).toHaveLength(7);
  });
});
