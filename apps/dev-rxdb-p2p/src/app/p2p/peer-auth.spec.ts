// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  importTicketSigningKey,
  importTicketVerifyKey,
  publicTicketKeyOf,
  signConnectionTicket
} from '../../../shared/connection-ticket';
import type { SignalingPeer } from '../../../shared/signaling-protocol';
import { authenticatePeerTicket } from './peer-auth';

const NOW = Date.UTC(2026, 10, 4, 9, 0, 0);

const peerOf = (name: string): SignalingPeer => ({
  key: `instance-${name}`,
  principal: `user-${name}`,
  userName: `${name}@example.com`,
  deviceId: `device-${name}`,
  deviceName: name
});

const setup = async () => {
  const pair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  const signing = await importTicketSigningKey(jwk);
  const verify = await importTicketVerifyKey(publicTicketKeyOf(jwk));
  const ticketFor = (peer: SignalingPeer, cid = 'connection-1') =>
    signConnectionTicket(
      { v: 1, cid, sub: peer.principal, dev: peer.deviceId, ins: peer.key, exp: NOW / 1000 + 60 },
      signing
    );
  return { verify, ticketFor };
};

describe('authenticatePeerTicket', () => {
  it('accepts the ticket that the signaling server issued to the expected peer', async () => {
    const { verify, ticketFor } = await setup();
    const bob = peerOf('bob');

    await expect(
      authenticatePeerTicket(await ticketFor(bob), { connectionId: 'connection-1' }, bob, verify, NOW)
    ).resolves.toEqual({ principal: 'user-bob', deviceId: 'device-bob' });
  });

  it('rejects our own ticket reflected back by the peer', async () => {
    const { verify, ticketFor } = await setup();

    await expect(
      authenticatePeerTicket(
        await ticketFor(peerOf('alice')),
        { connectionId: 'connection-1' },
        peerOf('bob'),
        verify,
        NOW
      )
    ).resolves.toBeNull();
  });

  it('rejects a ticket of another instance of the same device', async () => {
    const { verify, ticketFor } = await setup();
    const bob = peerOf('bob');

    await expect(
      authenticatePeerTicket(
        await ticketFor({ ...bob, key: 'instance-bob-2' }),
        { connectionId: 'connection-1' },
        bob,
        verify,
        NOW
      )
    ).resolves.toBeNull();
  });

  it('rejects a ticket for another connection', async () => {
    const { verify, ticketFor } = await setup();
    const bob = peerOf('bob');

    await expect(
      authenticatePeerTicket(await ticketFor(bob, 'connection-2'), { connectionId: 'connection-1' }, bob, verify, NOW)
    ).resolves.toBeNull();
  });
});
