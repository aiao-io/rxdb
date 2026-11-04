// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  importTicketSigningKey,
  importTicketVerifyKey,
  publicTicketKeyOf,
  signConnectionTicket,
  ticketPrincipal,
  verifyConnectionTicket,
  type ConnectionTicketClaims
} from './connection-ticket';

const NOW = Date.UTC(2026, 10, 4, 8, 0, 0);

const generateJwk = async (): Promise<JsonWebKey> => {
  const pair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  return crypto.subtle.exportKey('jwk', pair.privateKey);
};

const claims = (overrides: Partial<ConnectionTicketClaims> = {}): ConnectionTicketClaims => ({
  v: 1,
  cid: 'connection-1',
  sub: 'user-1',
  dev: 'device-1',
  ins: 'instance-1',
  exp: NOW / 1000 + 300,
  ...overrides
});

const keysFor = async (jwk: JsonWebKey) => ({
  signing: await importTicketSigningKey(jwk),
  verify: await importTicketVerifyKey(publicTicketKeyOf(jwk))
});

const swapClaim = (ticket: string, patch: Partial<ConnectionTicketClaims>): string => {
  const [body, signature] = ticket.split('.');
  const decoded = JSON.parse(atob(body!.replaceAll('-', '+').replaceAll('_', '/'))) as ConnectionTicketClaims;
  const forged = btoa(JSON.stringify({ ...decoded, ...patch }))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
  return `${forged}.${signature}`;
};

describe('connection ticket', () => {
  it('verifies a ticket signed for this connection', async () => {
    const keys = await keysFor(await generateJwk());
    const ticket = await signConnectionTicket(claims(), keys.signing);

    await expect(verifyConnectionTicket(ticket, keys.verify, { connectionId: 'connection-1', now: NOW })).resolves.toEqual(
      claims()
    );
  });

  it('rejects a ticket replayed on another connection', async () => {
    const keys = await keysFor(await generateJwk());
    const ticket = await signConnectionTicket(claims(), keys.signing);

    await expect(
      verifyConnectionTicket(ticket, keys.verify, { connectionId: 'connection-2', now: NOW })
    ).resolves.toBeNull();
  });

  it('rejects an expired ticket', async () => {
    const keys = await keysFor(await generateJwk());
    const ticket = await signConnectionTicket(claims({ exp: NOW / 1000 }), keys.signing);

    await expect(
      verifyConnectionTicket(ticket, keys.verify, { connectionId: 'connection-1', now: NOW })
    ).resolves.toBeNull();
  });

  it('rejects claims edited after signing', async () => {
    const keys = await keysFor(await generateJwk());
    const ticket = swapClaim(await signConnectionTicket(claims(), keys.signing), { sub: 'user-2' });

    await expect(
      verifyConnectionTicket(ticket, keys.verify, { connectionId: 'connection-1', now: NOW })
    ).resolves.toBeNull();
  });

  it('rejects a ticket signed by another key', async () => {
    const signer = await keysFor(await generateJwk());
    const verifier = await keysFor(await generateJwk());
    const ticket = await signConnectionTicket(claims(), signer.signing);

    await expect(
      verifyConnectionTicket(ticket, verifier.verify, { connectionId: 'connection-1', now: NOW })
    ).resolves.toBeNull();
  });

  it.each(['', 'only-body', 'a.b.c', '!!.??', 'e30.AAAA'])('rejects malformed ticket %j', async ticket => {
    const keys = await keysFor(await generateJwk());

    await expect(
      verifyConnectionTicket(ticket, keys.verify, { connectionId: 'connection-1', now: NOW })
    ).resolves.toBeNull();
  });

  it('imports only the key material, so a JWK exported with alg "Ed25519" also loads in workerd', async () => {
    const jwk = await generateJwk();
    const importKey = vi.spyOn(crypto.subtle, 'importKey');

    await importTicketSigningKey({ ...jwk, alg: 'Ed25519', key_ops: ['sign'], ext: true });

    expect(importKey).toHaveBeenCalledWith(
      'jwk',
      { kty: 'OKP', crv: 'Ed25519', x: jwk.x, d: jwk.d },
      { name: 'Ed25519' },
      false,
      ['sign']
    );
    importKey.mockRestore();
  });

  it('exposes only the public half of the key', async () => {
    const jwk = await generateJwk();

    expect(publicTicketKeyOf(jwk)).toEqual({ kty: 'OKP', crv: 'Ed25519', x: jwk.x });
  });

  it('maps claims to the session principal', () => {
    expect(ticketPrincipal(claims())).toEqual({ principal: 'user-1', deviceId: 'device-1' });
  });
});
