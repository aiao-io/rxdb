import { createOrbit } from '@aiao/orbit';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { configureServices } from '../testing/angular';
import { testApps } from '../testing/desktop-apps';
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
