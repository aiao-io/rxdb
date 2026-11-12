import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clientPackageApi } from './client-package-api';

const request = {
  packageName: '@acme/blog-rxdb',
  generatedFiles: [
    { path: 'index.js', content: 'export class Post {}' },
    { path: 'index.d.ts', content: 'export declare class Post {}' }
  ],
  designContract: { entities: [], metadata: { designName: 'Blog' } }
};

describe('clientPackageApi', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it('downloads archive bytes and reads trace headers', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(
      new Response(new Uint8Array([31, 139]), {
        headers: {
          'content-type': 'application/gzip',
          'content-disposition': 'attachment; filename="acme-blog-rxdb-1.0.0.tgz"',
          'x-package-name': '@acme/blog-rxdb',
          'x-package-version': '1.0.0',
          'x-design-revision': 'a'.repeat(64)
        }
      })
    );

    const result = await clientPackageApi.archive(request);

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/model-designer/client-packages/archive',
      expect.objectContaining({ method: 'POST', body: JSON.stringify(request) })
    );
    expect(result).toMatchObject({
      packageName: '@acme/blog-rxdb',
      version: '1.0.0',
      designRevision: 'a'.repeat(64),
      filename: 'acme-blog-rxdb-1.0.0.tgz'
    });
    expect(result.blob.type).toBe('application/gzip');
  });

  it('throws the API message when archive creation fails', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: 'pack_failed', message: 'npm pack failed' }), {
        status: 500,
        headers: { 'content-type': 'application/json' }
      })
    );

    await expect(clientPackageApi.archive(request)).rejects.toThrow('npm pack failed');
  });

  it('publishes and returns the confirmed registry version', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          packageName: '@acme/blog-rxdb',
          version: '1.1.0',
          designRevision: 'a'.repeat(64),
          status: 'published'
        }),
        { headers: { 'content-type': 'application/json' } }
      )
    );

    await expect(clientPackageApi.publish(request)).resolves.toMatchObject({ status: 'published', version: '1.1.0' });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/model-designer/client-packages/publish',
      expect.objectContaining({ method: 'POST', body: JSON.stringify(request) })
    );
  });
});
