import { describe, expect, it, vi } from 'vitest';
import { alice, bob, linkedTransports, openSessionPair, sessionOptions } from '../fixtures.js';
import { P2PSessionRegistry } from '../../session/registry.js';
import { openP2PSession } from '../../session/session.js';

describe('P2P 会话登记处', () => {
  it('登记就绪的会话并推送列表；会话结束后自动移除', async () => {
    const registry = new P2PSessionRegistry();
    const sizes: number[] = [];
    const subscription = registry.sessions$.subscribe(sessions => sizes.push(sessions.length));
    const [left, right] = openSessionPair();
    await expect(registry.add(left)).resolves.toBe(left);
    expect(registry.sessions).toEqual([left]);
    expect(registry.get(bob)).toBe(left);
    await right.close();
    await left.closed;
    await vi.waitFor(() => expect(registry.sessions).toEqual([]));
    expect(registry.get(bob)).toBeUndefined();
    expect(sizes).toEqual([0, 1, 0]);
    subscription.unsubscribe();
  });

  it('双方同时拨号：两端各自去重后保留同一条连接，另一条以 duplicate 关闭', async () => {
    const [aliceDial, bobAnswer] = linkedTransports();
    const [bobDial, aliceAnswer] = linkedTransports();
    const aliceOut = openP2PSession(sessionOptions(aliceDial, alice, { role: 'initiator', connectionId: 'c1' }));
    const bobIn = openP2PSession(sessionOptions(bobAnswer, bob, { role: 'responder', connectionId: 'c1' }));
    const bobOut = openP2PSession(sessionOptions(bobDial, bob, { role: 'initiator', connectionId: 'c2' }));
    const aliceIn = openP2PSession(sessionOptions(aliceAnswer, alice, { role: 'responder', connectionId: 'c2' }));
    const aliceRegistry = new P2PSessionRegistry();
    const bobRegistry = new P2PSessionRegistry();

    await Promise.all([aliceRegistry.add(aliceIn), bobRegistry.add(bobOut)]);
    const [keptByAlice, keptByBob] = await Promise.all([aliceRegistry.add(aliceOut), bobRegistry.add(bobIn)]);

    expect(keptByAlice.connectionId).toBe(keptByBob.connectionId);
    await vi.waitFor(() => {
      expect(aliceRegistry.sessions.map(session => session.connectionId)).toEqual([keptByAlice.connectionId]);
      expect(bobRegistry.sessions.map(session => session.connectionId)).toEqual([keptByAlice.connectionId]);
    });
    const losers = keptByAlice.connectionId === 'c1' ? [aliceIn, bobOut] : [aliceOut, bobIn];
    for (const loser of losers) {
      const reason = await loser.closed;
      expect(reason.code === 'duplicate' || reason.peerReason === 'duplicate').toBe(true);
    }
    await aliceRegistry.close();
    await bobRegistry.close();
  });

  it('同一方向的重复连接保留先登记的那条', async () => {
    const registry = new P2PSessionRegistry();
    const [first] = openSessionPair({ left: { connectionId: 'c1' }, right: { connectionId: 'c1' } });
    const [second] = openSessionPair({ left: { connectionId: 'c2' }, right: { connectionId: 'c2' } });
    await registry.add(first);
    await expect(registry.add(second)).resolves.toBe(first);
    await expect(second.closed).resolves.toMatchObject({ code: 'duplicate' });
    expect(registry.sessions).toEqual([first]);
    await registry.close();
    await expect(first.closed).resolves.toMatchObject({ code: 'closed' });
  });

  it('会话在就绪前失败：add 抛出结束原因，不登记', async () => {
    const registry = new P2PSessionRegistry();
    const [, rejecting] = openSessionPair({ right: { authenticate: () => null } });
    await expect(registry.add(rejecting)).rejects.toMatchObject({ code: 'unauthorized' });
    expect(registry.sessions).toEqual([]);
  });
});
