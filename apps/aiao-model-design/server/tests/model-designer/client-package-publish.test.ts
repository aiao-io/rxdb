// @vitest-environment node
import { readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { publishClientPackage, type NpmCommandRunner } from '../../src/routes/model-designer/client-package/npm-runner';
import { createClientPackageBuild } from '../../src/routes/model-designer/client-package/package-builder';
import { createClientPackageService } from '../../src/routes/model-designer/client-package/service';

const request = {
  packageName: '@acme/blog-rxdb',
  generatedFiles: [
    { path: 'index.js', content: 'export class Post {}' },
    { path: 'index.d.ts', content: 'export declare class Post {}' }
  ],
  designContract: {
    entities: [{ name: 'Post', properties: [{ name: 'title', type: 'string' }], relations: [] }],
    metadata: { designName: 'Blog' }
  }
};

function runnerWithLatest(latest: object | null, publishExitCode = 0) {
  const observations: Array<{ args: readonly string[]; tokenInUserconfig: boolean; userconfigMode?: number }> = [];
  const run = vi.fn<NpmCommandRunner['run']>(async (args, options) => {
    const userconfigIndex = args.indexOf('--userconfig');
    const userconfig = userconfigIndex >= 0 ? args[userconfigIndex + 1] : undefined;
    let tokenInUserconfig = false;
    let userconfigMode: number | undefined;
    if (userconfig) {
      tokenInUserconfig = (await readFile(userconfig, 'utf8')).includes('server-secret');
      userconfigMode = (await stat(userconfig)).mode & 0o777;
    }
    observations.push({ args, tokenInUserconfig, userconfigMode });

    if (args[0] === 'view') {
      return latest ?
          { exitCode: 0, stdout: JSON.stringify(latest), stderr: '' }
        : { exitCode: 1, stdout: '', stderr: 'E404' };
    }
    if (args[0] === 'pack') {
      const manifest = JSON.parse(await readFile(join(options.cwd, 'package.json'), 'utf8')) as {
        name: string;
        version: string;
      };
      const filename = `${manifest.name.replace('@', '').replace('/', '-')}-${manifest.version}.tgz`;
      await writeFile(join(options.cwd, filename), 'tgz');
      return { exitCode: 0, stdout: JSON.stringify([{ filename }]), stderr: '' };
    }
    const manifest = JSON.parse(await readFile(join(options.cwd, 'package.json'), 'utf8')) as {
      name: string;
      version: string;
    };
    return publishExitCode === 0 ?
        { exitCode: 0, stdout: JSON.stringify({ name: manifest.name, version: manifest.version }), stderr: '' }
      : { exitCode: publishExitCode, stdout: '', stderr: 'publish exploded' };
  });
  return { runner: { run } satisfies NpmCommandRunner, run, observations };
}

describe('client package publish service', () => {
  it('accepts npm 11 keyed publish confirmation', async () => {
    const runner: NpmCommandRunner = {
      run: vi.fn(async () => ({
        exitCode: 0,
        stdout: JSON.stringify({
          [request.packageName]: { name: request.packageName, version: '1.0.0' }
        }),
        stderr: ''
      }))
    };

    await expect(
      publishClientPackage(
        runner,
        '/tmp/client-package',
        request.packageName,
        '1.0.0',
        { registryUrl: 'http://127.0.0.1:4873', token: 'server-secret' },
        '/tmp/client-package/.npmrc'
      )
    ).resolves.toBeUndefined();
  });

  it('queries latest, computes the next version, and keeps the token in a 0600 userconfig', async () => {
    const previousContract = { ...request.designContract, entities: [] };
    const latest = { version: '1.0.0', aiao: { designRevision: 'b'.repeat(64), designContract: previousContract } };
    const { runner, observations } = runnerWithLatest(latest);
    const service = createClientPackageService(runner, {
      registryUrl: 'http://127.0.0.1:4873',
      token: 'server-secret'
    });

    const result = await service.publish(request);

    expect(result).toMatchObject({ packageName: '@acme/blog-rxdb', version: '1.1.0', status: 'published' });
    expect(observations).toHaveLength(3);
    expect(observations.every(item => item.userconfigMode === 0o600)).toBe(true);
    expect(observations.every(item => item.tokenInUserconfig)).toBe(true);
    expect(observations.flatMap(item => item.args).join(' ')).not.toContain('server-secret');
  });

  it('rejects a duplicate design revision before pack or publish', async () => {
    const build = createClientPackageBuild(request, '1.0.0');
    const latest = {
      version: '1.0.0',
      aiao: { designRevision: build.designRevision, designContract: build.manifest.aiao.designContract }
    };
    const { runner, run } = runnerWithLatest(latest);
    const service = createClientPackageService(runner, {
      registryUrl: 'http://127.0.0.1:4873',
      token: 'server-secret'
    });

    await expect(service.publish(request)).rejects.toMatchObject({ code: 'duplicate_revision', status: 409 });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('fails fast when registry configuration is absent', async () => {
    const { runner, run } = runnerWithLatest(null);
    const service = createClientPackageService(runner, { registryUrl: '', token: '' });

    await expect(service.publish(request)).rejects.toMatchObject({ code: 'registry_not_configured', status: 503 });
    expect(run).not.toHaveBeenCalled();
  });

  it('maps registry query and publish failures without reporting success', async () => {
    const registryRunner: NpmCommandRunner = {
      run: vi.fn(async () => ({ exitCode: 1, stdout: '', stderr: 'ECONNREFUSED' }))
    };
    await expect(
      createClientPackageService(registryRunner, {
        registryUrl: 'http://127.0.0.1:4873',
        token: 'server-secret'
      }).publish(request)
    ).rejects.toMatchObject({ code: 'registry_failed', status: 502 });

    const { runner } = runnerWithLatest(null, 1);
    await expect(
      createClientPackageService(runner, { registryUrl: 'http://127.0.0.1:4873', token: 'server-secret' }).publish(
        request
      )
    ).rejects.toMatchObject({ code: 'publish_failed', status: 502 });
  });
});
