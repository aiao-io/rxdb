import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createRelayTaskToken,
  isRelayTaskToken,
  openRelayResult,
  relayResultKey,
  relayTaskTokenHash,
  sealRelayResult
} from './relay-task';

const taskId = '10000000-0000-4000-8000-000000000009';
const otherTask = '10000000-0000-4000-8000-00000000000a';
const text = '{"data":[{"b64_json":"private-image"}]}';
const plain = () => new TextEncoder().encode(text);

beforeEach(() => vi.stubGlobal('crypto', webcrypto));
afterEach(() => vi.unstubAllGlobals());

describe('relay task token', () => {
  it('creates 32 random bytes as unpadded base64url', () => {
    const first = createRelayTaskToken();
    expect(isRelayTaskToken(first)).toBe(true);
    expect(first).not.toBe(createRelayTaskToken());
  });
  it.each(['', 'short', `${'a'.repeat(42)}=`, `${'a'.repeat(42)}+`, 'a'.repeat(44), 42, null])(
    'rejects malformed token %s',
    value => expect(isRelayTaskToken(value)).toBe(false)
  );
  it('exposes only a stable SHA-256 digest of the token', async () => {
    const token = createRelayTaskToken();
    const hash = await relayTaskTokenHash(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(await relayTaskTokenHash(token)).toBe(hash);
    expect(await relayTaskTokenHash(createRelayTaskToken())).not.toBe(hash);
  });
});

describe('relay result sealing', () => {
  it('round-trips only with the same token and task', async () => {
    const token = createRelayTaskToken();
    const sealed = await sealRelayResult(await relayResultKey(token, taskId, 'encrypt'), plain());
    expect(sealed.byteLength).toBe(plain().byteLength + 12 + 16);
    expect(new TextDecoder().decode(sealed)).not.toContain('private-image');
    const opened = await openRelayResult(await relayResultKey(token, taskId, 'decrypt'), sealed);
    expect(new TextDecoder().decode(opened)).toBe(text);
    await expect(
      openRelayResult(await relayResultKey(createRelayTaskToken(), taskId, 'decrypt'), sealed)
    ).rejects.toThrow();
    await expect(openRelayResult(await relayResultKey(token, otherTask, 'decrypt'), sealed)).rejects.toThrow();
  });
  it('uses a fresh IV for every seal of the same bytes', async () => {
    const key = await relayResultKey(createRelayTaskToken(), taskId, 'encrypt');
    const [first, second] = await Promise.all([sealRelayResult(key, plain()), sealRelayResult(key, plain())]);
    expect(Array.from(first.subarray(0, 12))).not.toEqual(Array.from(second.subarray(0, 12)));
  });
});
