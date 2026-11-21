import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { APPROVED_CATALOG_CONFIG } from '../data/approved-catalog-config';
import { DesktopData } from '../data/desktop-data';
import { Preferences } from '../data/preferences';
import { configureServices } from '../testing/angular';
import { testApps } from '../testing/desktop-apps';
import { DESKTOP_APPS } from './desktop-apps';
import { CATALOG_CACHE_KEY, INSTALLATIONS_KEY, InstalledApplications } from './installed-applications';

const releases = [1, 2].map(version => ({
  id: 'catalog:editor',
  name: 'Approved Editor',
  bundleId: 'io.example.editor',
  version: `${version}.0.0`,
  url: `https://apps.example/releases/${version}.0.0/editor/`,
  summary: 'Edit text.',
  capabilities: ['window'],
  allow: [],
  readyTimeout: 10000
}));
const contents = JSON.stringify({ formatVersion: 1, releases });
const digest = async () =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(contents)))]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');

async function setup(initial: Record<string, unknown> = {}) {
  const values = new Map(Object.entries(initial));
  const external$ = new Subject<readonly string[]>();
  const preferences = {
    ready: Promise.resolve(),
    external$,
    get: (key: string, guard: (value: unknown) => boolean) => (guard(values.get(key)) ? values.get(key) : undefined),
    set: vi.fn(async (key: string, value: unknown) => {
      values.set(key, value);
    })
  };
  const read = vi.fn(async () => [...values].map(([key, value]) => ({ key, value })));
  const data = {
    tabs: { exclusive: vi.fn(async <T>(run: () => Promise<T>) => run()) },
    repository: async () => ({ find: read })
  };
  const hash = await digest();
  configureServices([
    InstalledApplications,
    { provide: Preferences, useValue: preferences },
    { provide: DesktopData, useValue: data },
    { provide: DESKTOP_APPS, useValue: testApps() },
    { provide: APPROVED_CATALOG_CONFIG, useValue: { file: 'approved-apps.json', sha256: hash, trustedDigests: [hash] } }
  ]);
  const service = TestBed.inject(InstalledApplications);
  await service.ready;
  return { service, values, preferences, data, hash, external$ };
}

beforeEach(() => {
  vi.stubGlobal('document', { baseURI: 'https://desktop.example/' });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(contents))
  );
});

describe('目录安装持久化服务', () => {
  it('初次启动不请求网络；加载批准目录后安装、更新、回退和卸载串行持久化', async () => {
    const { service, values, data } = await setup();
    expect(fetch).not.toHaveBeenCalled();
    await service.refresh();
    expect(service.catalog().releases).toHaveLength(2);
    const projection = vi.fn(async (_releases: unknown, commit: () => Promise<void>) => commit());
    await service.apply('catalog:editor', '1.0.0', projection);
    await service.apply('catalog:editor', '2.0.0', projection);
    expect(service.state().apps[0].previous).toBe('1.0.0');
    await service.apply('catalog:editor', service.state().apps[0].previous, projection);
    expect(service.state().apps[0].version).toBe('1.0.0');
    await service.apply('catalog:editor', null, projection);
    expect(values.get(INSTALLATIONS_KEY)).toEqual({ version: 1, apps: [] });
    expect(data.tabs.exclusive).toHaveBeenCalledTimes(5);
  });

  it('重开校验已批准缓存，不依赖目录网络；网络失败保留已安装入口', async () => {
    const hash = await digest();
    const initial = {
      [CATALOG_CACHE_KEY]: { digest: hash, contents },
      [INSTALLATIONS_KEY]: { version: 1, apps: [{ id: 'catalog:editor', version: '1.0.0', previous: null }] }
    };
    const { service } = await setup(initial);
    expect(service.state().apps[0].version).toBe('1.0.0');
    vi.mocked(fetch).mockRejectedValueOnce(new Error('offline'));
    await expect(service.refresh()).rejects.toThrow('offline');
    expect(service.state().apps[0].version).toBe('1.0.0');
    expect(service.catalog().releases).toHaveLength(2);
  });

  it('篡改缓存或安装状态明确失败，不授予任意来源和权限', async () => {
    const { service } = await setup({
      [CATALOG_CACHE_KEY]: { digest: '0'.repeat(64), contents },
      [INSTALLATIONS_KEY]: { version: 1, apps: [{ id: 'catalog:editor', version: '1.0.0', previous: null }] }
    });
    expect(service.failure()).toContain('approved');
    expect(service.state().apps).toEqual([]);
    await expect(service.apply('catalog:editor', '1.0.0', async () => undefined)).rejects.toThrow();
  });

  it('投影或持久化失败不发布新安装，后续可重试；多页写入从库重读当前状态', async () => {
    const { service, preferences, values } = await setup();
    await service.refresh();
    await expect(
      service.apply('catalog:editor', '1.0.0', async () => {
        throw new Error('projection denied');
      })
    ).rejects.toThrow('projection denied');
    expect(service.state().apps).toEqual([]);
    preferences.set.mockRejectedValueOnce(new Error('quota'));
    await expect(service.apply('catalog:editor', '1.0.0', async (_releases, commit) => commit())).rejects.toThrow(
      'quota'
    );
    expect(service.state().apps).toEqual([]);
    values.set(INSTALLATIONS_KEY, { version: 1, apps: [{ id: 'catalog:editor', version: '1.0.0', previous: null }] });
    await service.apply('catalog:editor', '2.0.0', async (_releases, commit) => commit());
    expect(service.state().apps[0].previous).toBe('1.0.0');
  });

  it('其他页安装变化重新校验缓存和安装集；坏数据不保留旧授权', async () => {
    const { service, values, external$, hash } = await setup();
    values.set(CATALOG_CACHE_KEY, { digest: hash, contents });
    values.set(INSTALLATIONS_KEY, { version: 1, apps: [{ id: 'catalog:editor', version: '1.0.0', previous: null }] });
    external$.next([INSTALLATIONS_KEY]);
    await vi.waitFor(() => expect(service.state().apps).toHaveLength(1));
    values.set(INSTALLATIONS_KEY, 'broken');
    external$.next([INSTALLATIONS_KEY]);
    await vi.waitFor(() => expect(service.failure()).not.toBe(''));
    expect(service.state().apps).toEqual([]);
  });

  it('下载错误、超限、摘要失配不覆盖已有缓存', async () => {
    const { service, values } = await setup();
    await service.refresh();
    const cached = values.get(CATALOG_CACHE_KEY);
    vi.mocked(fetch).mockResolvedValueOnce(new Response('error', { status: 503 }));
    await expect(service.refresh()).rejects.toThrow('503');
    vi.mocked(fetch).mockResolvedValueOnce(new Response(new Uint8Array(1024 * 1024 + 1)));
    await expect(service.refresh()).rejects.toThrow('1 MiB');
    vi.mocked(fetch).mockResolvedValueOnce(new Response('{}'));
    await expect(service.refresh()).rejects.toThrow('approval');
    expect(values.get(CATALOG_CACHE_KEY)).toEqual(cached);
  });
});

describe('安装快照与恢复', () => {
  it('文件投影前直接重读数据库，不用滞后的偏好缓存撤销另一页的安装', async () => {
    const { service, values, preferences, hash } = await setup();
    preferences.get = () => undefined;
    values.set(CATALOG_CACHE_KEY, { digest: hash, contents });
    values.set(INSTALLATIONS_KEY, {
      version: 1,
      apps: [{ id: 'catalog:editor', version: '2.0.0', previous: '1.0.0' }]
    });
    expect((await service.reload())[0].version).toBe('2.0.0');
    expect(service.state().apps[0].version).toBe('2.0.0');
  });

  it('确认过期时拒绝更新；坏状态只有显式重置才会清除，用户文件交由投影层保留', async () => {
    const { service, values } = await setup();
    await service.refresh();
    const project = vi.fn(async (_releases: unknown, commit: () => Promise<void>) => commit());
    await service.apply('catalog:editor', '1.0.0', project, null);
    await expect(service.apply('catalog:editor', '2.0.0', project, null)).rejects.toThrow('changed');
    values.set(INSTALLATIONS_KEY, 'broken');
    await service.reload();
    expect(service.failure()).not.toBe('');
    expect(values.get(INSTALLATIONS_KEY)).toBe('broken');
    await service.reset(project);
    expect(service.failure()).toBe('');
    expect(values.get(INSTALLATIONS_KEY)).toEqual({ version: 1, apps: [] });
    expect(values.get(CATALOG_CACHE_KEY)).toBeNull();
    await service.reload();
    expect(service.failure()).toBe('');
    expect(service.state().apps).toEqual([]);
  });
});
