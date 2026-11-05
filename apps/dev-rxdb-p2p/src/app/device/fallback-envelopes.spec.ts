// @vitest-environment node
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { envelopeFor, writeEnvelopes } from './fallback-envelopes';

const ROW = {
  contentHash: 'a'.repeat(64),
  recipientDeviceId: 'device-a',
  kid: 'p256-1',
  epk: 'ephemeral-key',
  iv: 'nonce',
  ct: 'ciphertext',
  tag: 'authentication-tag'
};

const clientWith = ({ data = null, error = null }: { data?: unknown; error?: Error | null } = {}) => {
  const table = {
    upsert: vi.fn<(rows: readonly object[], options: { onConflict: string }) => Promise<{ error: Error | null }>>(
      async () => ({ error })
    ),
    select: vi.fn(() => table),
    eq: vi.fn(() => table),
    maybeSingle: vi.fn(async () => ({ data, error }))
  };
  const from = vi.fn(() => table);
  const schema = vi.fn(() => ({ from }));
  return { client: { schema } as unknown as SupabaseClient, schema, from, table };
};

describe('fallback envelope persistence', () => {
  it('does not send an empty envelope batch', async () => {
    const { client, schema } = clientWith();

    await expect(writeEnvelopes(client, [])).resolves.toBeUndefined();
    expect(schema).not.toHaveBeenCalled();
  });

  it('upserts envelope rows with generated ids and the logical conflict key', async () => {
    const { client, from, table } = clientWith();

    await writeEnvelopes(client, [ROW]);

    expect(from).toHaveBeenCalledExactlyOnceWith('p2p_fallback_envelope');
    const [rows, options] = table.upsert.mock.calls[0]!;
    expect(rows).toEqual([{ ...ROW, id: expect.any(String) }]);
    expect(options).toEqual({ onConflict: '"contentHash","recipientDeviceId"' });
  });

  it('returns the recipient envelope or null and filters by file and device', async () => {
    const envelope = { kid: 'p256-1', epk: 'key', iv: 'iv', ct: 'data', tag: 'tag' };
    const found = clientWith({ data: envelope });

    await expect(envelopeFor(found.client, ROW.contentHash, ROW.recipientDeviceId)).resolves.toEqual(envelope);
    expect(found.from).toHaveBeenCalledExactlyOnceWith('p2p_fallback_envelope');
    expect(found.table.select).toHaveBeenCalledExactlyOnceWith('kid,epk,iv,ct,tag');
    expect(found.table.eq.mock.calls).toEqual([
      ['contentHash', ROW.contentHash],
      ['recipientDeviceId', ROW.recipientDeviceId]
    ]);

    await expect(envelopeFor(clientWith().client, ROW.contentHash, ROW.recipientDeviceId)).resolves.toBeNull();
  });

  it('surfaces database errors for both read and write operations', async () => {
    const error = new Error('database unavailable');
    await expect(writeEnvelopes(clientWith({ error }).client, [ROW])).rejects.toBe(error);
    await expect(envelopeFor(clientWith({ error }).client, ROW.contentHash, ROW.recipientDeviceId)).rejects.toBe(error);
  });
});
