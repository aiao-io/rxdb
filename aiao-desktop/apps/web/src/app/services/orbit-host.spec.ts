import { createOrbit } from '@aiao/orbit';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApprovedRelease, catalogManifest } from '../data/approved-catalog';
import { configureServices } from '../testing/angular';
import { testApps } from '../testing/desktop-apps';
import { ApplicationRegistry } from './application-registry';
import { DESKTOP_APPS, DesktopAppRegistry } from './desktop-apps';
import { OrbitHost } from './orbit-host';

const { dispose } = vi.hoisted(() => ({ dispose: vi.fn() }));

vi.mock('@aiao/orbit', () => ({ createOrbit: vi.fn(() => ({ dispose })) }));

/** 把 notes 改登记成集成应用，其余保持内置。 */
const withWebApp = (url: string): DesktopAppRegistry =>
  testApps({
    notes: {
      kind: 'web',
      web: { url, version: 'online', allow: [], readyTimeout: 1000 }
    } as never
  });

function setup(apps: DesktopAppRegistry = testApps()) {
  configureServices([OrbitHost, { provide: DESKTOP_APPS, useValue: apps }]);
  const host = TestBed.inject(OrbitHost);
  const options = vi.mocked(createOrbit).mock.calls.at(-1)?.[0];
  if (!options) throw new Error('OrbitHost 应该创建了运行内核');
  return { host, options };
}

afterEach(() => {
  TestBed.resetTestingModule();
  vi.mocked(createOrbit).mockClear();
  dispose.mockClear();
  vi.restoreAllMocks();
});

describe('OrbitHost', () => {
  it('允许来源只取登记表里集成应用入口的精确来源，没有集成应用时为空', () => {
    expect(setup().options.allowedOrigins).toEqual([]);
    expect(setup(withWebApp('https://code.example.com/editor?x=1')).options.allowedOrigins).toEqual([
      'https://code.example.com'
    ]);
  });

  it('运行内核暴露为 runtime', () => {
    const { host } = setup();
    expect(host.runtime).toEqual({ dispose });
  });

  it('窗口自己显示的失败不再上报，其余错误打到控制台', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { options } = setup();
    options.onError?.(Object.assign(new Error('boom'), { code: 'TIMEOUT' }));
    options.onError?.(Object.assign(new Error('closed'), { code: 'DESTROYED' }));
    expect(log).not.toHaveBeenCalled();

    const protocol = Object.assign(new Error('bad frame'), { code: 'PROTOCOL' });
    options.onError?.(protocol);
    expect(log).toHaveBeenCalledExactlyOnceWith(protocol);
  });

  it('宿主销毁时释放运行内核', () => {
    setup();
    expect(dispose).not.toHaveBeenCalled();
    TestBed.resetTestingModule();
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});

const approved: ApprovedRelease = {
  id: 'catalog:editor',
  name: 'Approved Editor',
  bundleId: 'io.example.editor',
  version: '1.0.0',
  url: 'https://apps.example/releases/1.0.0/editor/',
  summary: 'Edit text.',
  capabilities: ['window'],
  allow: [],
  readyTimeout: 10000
};

describe('批准应用的 Orbit 授权', () => {
  it('未安装或已换版本的清单不能创建运行内核', () => {
    const { host } = setup();
    expect(() => host.connect(catalogManifest(approved))).toThrow('installed');
    TestBed.inject(ApplicationRegistry).replace([approved]);
    expect(() => host.connect(catalogManifest({ ...approved, version: '2.0.0' }))).toThrow('installed');
    expect(createOrbit).toHaveBeenCalledTimes(1);
  });

  it('每个可选应用只信任自身精确来源，关闭时只释放自己的内核', () => {
    const { host } = setup(withWebApp('https://preinstalled.example/editor'));
    TestBed.inject(ApplicationRegistry).replace([approved]);
    const connection = host.connect(catalogManifest(approved));
    expect(createOrbit).toHaveBeenLastCalledWith(expect.objectContaining({ allowedOrigins: ['https://apps.example'] }));
    connection.dispose();
    connection.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('跨页更新和卸载立即撤回旧内核，不重建未改变版本的运行实例', () => {
    const { host } = setup();
    const registry = TestBed.inject(ApplicationRegistry);
    registry.replace([approved]);
    const connection = host.connect(catalogManifest(approved));
    TestBed.tick();
    registry.replace([{ ...approved }]);
    TestBed.tick();
    expect(dispose).not.toHaveBeenCalled();
    registry.replace([{ ...approved, version: '2.0.0', url: 'https://apps.example/releases/2.0.0/editor/' }]);
    TestBed.tick();
    expect(dispose).toHaveBeenCalledTimes(1);
    connection.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
    const current = registry.apps()['catalog:editor'];
    if (current.kind !== 'web') throw new Error('expected a web application');
    host.connect(current);
    registry.replace([]);
    TestBed.tick();
    expect(dispose).toHaveBeenCalledTimes(2);
  });
});
