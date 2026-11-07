// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { importTicketVerifyKey, verifyConnectionTicket } from '../shared/connection-ticket';
import type { SignalingPeer } from '../shared/signaling-protocol';
import { createTicketIssuer, TICKET_TTL_SECONDS } from './tickets';

const NOW = Date.UTC(2026, 10, 4, 8, 0, 0);

const peerOf = (name: string): SignalingPeer => ({
  key: `instance-${name}`,
  principal: `user-${name}`,
  userName: `${name}@example.com`,
  deviceId: `device-${name}`,
  deviceName: name
});

const privateJwkText = async (): Promise<string> => {
  const pair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  return JSON.stringify(await crypto.subtle.exportKey('jwk', pair.privateKey));
};

describe('createTicketIssuer', () => {
  it('signs one ticket per end, each bound to that end and the connection', async () => {
    const issuer = await createTicketIssuer(await privateJwkText(), () => NOW);
    const verifyKey = await importTicketVerifyKey(issuer.publicKey);

    const [initiator, responder] = await issuer.issue('connection-1', peerOf('alice'), peerOf('bob'));

    const expected = { connectionId: 'connection-1', now: NOW };
    await expect(verifyConnectionTicket(initiator, verifyKey, expected)).resolves.toEqual({
      v: 1,
      cid: 'connection-1',
      sub: 'user-alice',
      dev: 'device-alice',
      ins: 'instance-alice',
      exp: NOW / 1000 + TICKET_TTL_SECONDS
    });
    await expect(verifyConnectionTicket(responder, verifyKey, expected)).resolves.toMatchObject({ sub: 'user-bob' });
  });

  it('publishes only the public half of the key', async () => {
    const issuer = await createTicketIssuer(await privateJwkText(), () => NOW);

    expect(Object.keys(issuer.publicKey).sort()).toEqual(['crv', 'kty', 'x']);
  });

  it('refuses to start without a usable private key', async () => {
    await expect(createTicketIssuer('', () => NOW)).rejects.toThrow('TICKET_PRIVATE_JWK');
    await expect(createTicketIssuer('{"kty":"OKP","crv":"Ed25519","x":"abc"}', () => NOW)).rejects.toThrow(
      'TICKET_PRIVATE_JWK'
    );
  });
});
