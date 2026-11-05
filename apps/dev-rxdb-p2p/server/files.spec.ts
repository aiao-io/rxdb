// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { fileKey, handleFileRequest, MAX_UPLOAD_BYTES, type FileRouteDeps } from './files';
import type { R2BucketLike } from './runtime';

const HASH = 'a'.repeat(64);
const BYTES = new Uint8Array([1, 2, 3, 4]);

class FakeBucket implements R2BucketLike {
  readonly objects = new Map<string, Uint8Array>();
  readonly put = vi.fn(async (key: string, value: ReadableStream<Uint8Array>, options: { readonly sha256: string }) => {
    const bytes = new Uint8Array(await new Response(value).arrayBuffer());
    if (options.sha256 !== HASH) throw new Error('checksum mismatch');
    this.objects.set(key, bytes);
    return {};
  });

  async head(key: string): Promise<{ readonly size: number } | null> {
    const bytes = this.objects.get(key);
    return bytes ? { size: bytes.byteLength } : null;
  }

  async get(key: string) {
    const bytes = this.objects.get(key);
    return bytes ?
        {
          body: new Response(bytes as Uint8Array<ArrayBuffer>).body as ReadableStream<Uint8Array>,
          size: bytes.byteLength
        }
      : null;
  }

  async list(options: { readonly prefix: string; readonly limit: number }) {
    const matching = [...this.objects].filter(([key]) => key.startsWith(options.prefix));
    const objects = matching
      .slice(0, options.limit)
      .map(([key, bytes]) => ({ key, size: bytes.byteLength, uploaded: new Date(0) }));
    return { objects, truncated: matching.length > options.limit };
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }
}

const depsWith = (bucket = new FakeBucket()): FileRouteDeps & { readonly bucket: FakeBucket } => ({
  bucket,
  verifyUser: async token => (token === 'good' ? { id: 'user-1', email: 'a@example.com' } : null)
});

const request = (
  method: string,
  init: { readonly token?: string; readonly body?: BodyInit; readonly length?: number } = {}
) => {
  const headers = new Headers();
  if (init.token) headers.set('authorization', `Bearer ${init.token}`);
  if (init.length !== undefined) headers.set('content-length', String(init.length));
  return new Request(`http://worker.test/api/files/${HASH}`, {
    method,
    headers,
    body: init.body,
    duplex: 'half'
  } as RequestInit);
};

describe('handleFileRequest', () => {
  it('rejects a key that is not a content hash', async () => {
    const response = await handleFileRequest(request('GET', { token: 'good' }), 'abc', depsWith());

    expect(response.status).toBe(400);
  });

  it.each([undefined, 'bad'])('requires a valid access token (%s)', async token => {
    const response = await handleFileRequest(request('GET', { token }), HASH, depsWith());

    expect(response.status).toBe(401);
  });

  it('streams a stored file back', async () => {
    const deps = depsWith();
    deps.bucket.objects.set(fileKey(HASH), BYTES);

    const response = await handleFileRequest(request('GET', { token: 'good' }), HASH, deps);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-length')).toBe('4');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(BYTES);
  });

  it.each(['GET', 'HEAD'])('answers %s for a missing file with 404', async method => {
    const response = await handleFileRequest(request(method, { token: 'good' }), HASH, depsWith());

    expect(response.status).toBe(404);
  });

  it('reports the size of a stored file on HEAD', async () => {
    const deps = depsWith();
    deps.bucket.objects.set(fileKey(HASH), BYTES);

    const response = await handleFileRequest(request('HEAD', { token: 'good' }), HASH, deps);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-length')).toBe('4');
  });

  it('stores an upload under its hash and lets R2 verify the checksum', async () => {
    const deps = depsWith();

    const response = await handleFileRequest(request('PUT', { token: 'good', body: BYTES, length: 4 }), HASH, deps);

    expect(response.status).toBe(201);
    expect(deps.bucket.put).toHaveBeenCalledWith(fileKey(HASH), expect.anything(), { sha256: HASH });
    expect(deps.bucket.objects.get(fileKey(HASH))).toEqual(BYTES);
  });

  it('does not upload a file that is already stored', async () => {
    const deps = depsWith();
    deps.bucket.objects.set(fileKey(HASH), BYTES);

    const response = await handleFileRequest(request('PUT', { token: 'good', body: BYTES, length: 4 }), HASH, deps);

    expect(response.status).toBe(200);
    expect(deps.bucket.put).not.toHaveBeenCalled();
  });

  it('requires the upload size up front', async () => {
    const response = await handleFileRequest(request('PUT', { token: 'good', body: BYTES }), HASH, depsWith());

    expect(response.status).toBe(411);
  });

  it('refuses uploads above the request body limit', async () => {
    const response = await handleFileRequest(
      request('PUT', { token: 'good', body: BYTES, length: MAX_UPLOAD_BYTES + 1 }),
      HASH,
      depsWith()
    );

    expect(response.status).toBe(413);
  });

  it('reports a storage rejection', async () => {
    const deps = depsWith();
    deps.bucket.put.mockRejectedValueOnce(new Error('checksum mismatch'));

    const response = await handleFileRequest(request('PUT', { token: 'good', body: BYTES, length: 4 }), HASH, deps);

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ error: 'storage rejected the upload: checksum mismatch' });
  });

  it('allows only GET, HEAD and PUT', async () => {
    const response = await handleFileRequest(request('DELETE', { token: 'good' }), HASH, depsWith());

    expect(response.status).toBe(405);
  });
});
