// @vitest-environment node
import { Elysia } from 'elysia';
import { describe, expect, it, vi } from 'vitest';
import {
  ClientPackageError,
  type ClientPackageErrorCode
} from '../../src/routes/model-designer/client-package/npm-runner';
import { createModelDesignerRoutes } from '../../src/routes/model-designer/routes';

const requestBody = {
  packageName: '@acme/blog-rxdb',
  generatedFiles: [
    { path: 'index.js', content: 'export class Post {}' },
    { path: 'index.d.ts', content: 'export declare class Post {}' }
  ],
  designContract: { entities: [], metadata: { designName: 'Blog' } }
};

describe('model-designer client package routes', () => {
  it('returns a tgz archive with traceable package headers', async () => {
    const archive = vi.fn(async () => ({
      bytes: new Uint8Array([31, 139]),
      filename: 'acme-blog-rxdb-1.0.0.tgz',
      packageName: '@acme/blog-rxdb',
      version: '1.0.0',
      designRevision: 'a'.repeat(64)
    }));
    const app = new Elysia().group('/api', group =>
      group.use(createModelDesignerRoutes({ schemaReader: null, clientPackages: { archive } }))
    );

    const response = await app.handle(
      new Request('http://localhost/api/model-designer/client-packages/archive', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(requestBody)
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/gzip');
    expect(response.headers.get('x-package-name')).toBe('@acme/blog-rxdb');
    expect(response.headers.get('x-package-version')).toBe('1.0.0');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([31, 139]));
    expect(archive).toHaveBeenCalledWith(requestBody);
  });

  it('rejects malformed package requests before invoking the service', async () => {
    const archive = vi.fn();
    const app = new Elysia().group('/api', group =>
      group.use(createModelDesignerRoutes({ schemaReader: null, clientPackages: { archive } }))
    );
    const response = await app.handle(
      new Request('http://localhost/api/model-designer/client-packages/archive', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ packageName: '@acme/blog-rxdb' })
      })
    );

    expect(response.status).toBe(422);
    expect(archive).not.toHaveBeenCalled();
  });

  it('publishes through the shared service and returns the confirmed publication', async () => {
    const publish = vi.fn(async () => ({
      packageName: '@acme/blog-rxdb',
      version: '1.1.0',
      designRevision: 'a'.repeat(64),
      status: 'published' as const
    }));
    const app = new Elysia().group('/api', group =>
      group.use(createModelDesignerRoutes({ schemaReader: null, clientPackages: { archive: vi.fn(), publish } }))
    );

    const response = await app.handle(
      new Request('http://localhost/api/model-designer/client-packages/publish', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(requestBody)
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'published', version: '1.1.0' });
    expect(publish).toHaveBeenCalledWith(requestBody);
  });

  it.each([
    ['duplicate_revision', 409],
    ['registry_failed', 502],
    ['registry_not_configured', 503]
  ])('maps %s publish errors to HTTP %s', async (code, status) => {
    const error = new ClientPackageError(code as ClientPackageErrorCode, status as 409 | 502 | 503, code);
    const publish = vi.fn(async () => Promise.reject(error));
    const app = new Elysia().group('/api', group =>
      group.use(createModelDesignerRoutes({ schemaReader: null, clientPackages: { archive: vi.fn(), publish } }))
    );
    const response = await app.handle(
      new Request('http://localhost/api/model-designer/client-packages/publish', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(requestBody)
      })
    );

    expect(response.status).toBe(status);
  });
});
