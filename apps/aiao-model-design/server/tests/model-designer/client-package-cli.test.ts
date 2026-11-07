// @vitest-environment node
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runModelClientPackageCli } from '../../src/routes/model-designer/client-package/cli';

const roots: string[] = [];
const request = {
  packageName: '@acme/blog-rxdb',
  generatedFiles: [
    { path: 'index.js', content: 'export {}' },
    { path: 'index.d.ts', content: 'export {}' }
  ],
  designContract: { entities: [], metadata: { designName: 'Blog' } }
};

describe('model client package CLI', () => {
  afterEach(async () => Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))));

  it('uses the shared archive service and writes its tgz', async () => {
    const root = await mkdtemp(join(tmpdir(), 'client-package-cli-'));
    roots.push(root);
    const input = join(root, 'request.json');
    const output = join(root, 'artifacts');
    await writeFile(input, JSON.stringify(request));
    const archive = vi.fn(async () => ({
      bytes: new Uint8Array([31, 139]),
      filename: 'acme-blog-rxdb-1.0.0.tgz',
      packageName: request.packageName,
      version: '1.0.0',
      designRevision: 'a'.repeat(64)
    }));

    const exitCode = await runModelClientPackageCli(['archive', '--input', input, '--out', output], {
      service: { archive, publish: vi.fn() },
      writeLine: vi.fn()
    });

    expect(exitCode).toBe(0);
    expect(archive).toHaveBeenCalledWith(request);
    expect(new Uint8Array(await readFile(join(output, 'acme-blog-rxdb-1.0.0.tgz')))).toEqual(new Uint8Array([31, 139]));
  });

  it('uses the shared publish service and prints the publication', async () => {
    const root = await mkdtemp(join(tmpdir(), 'client-package-cli-'));
    roots.push(root);
    const input = join(root, 'request.json');
    await writeFile(input, JSON.stringify(request));
    const writeLine = vi.fn();
    const publish = vi.fn(async () => ({
      packageName: request.packageName,
      version: '1.0.0',
      designRevision: 'a'.repeat(64),
      status: 'published' as const
    }));

    const exitCode = await runModelClientPackageCli(['publish', '--input', input], {
      service: { archive: vi.fn(), publish },
      writeLine
    });

    expect(exitCode).toBe(0);
    expect(publish).toHaveBeenCalledWith(request);
    expect(JSON.parse(writeLine.mock.calls[0][0] as string)).toMatchObject({ status: 'published', version: '1.0.0' });
  });
});
