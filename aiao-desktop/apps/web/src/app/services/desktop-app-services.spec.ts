import { DestroyRef, InjectionToken, Injector, Service, inject } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';

import { configureServices } from '../testing/angular';
import { DesktopAppServices } from './desktop-app-services';

const desktopName = new InjectionToken<string>('desktop name');
const created = vi.fn();
const disposed = vi.fn();

@Service({ autoProvided: false })
class Feature {
  readonly desktop = inject(desktopName);

  constructor() {
    created(this.desktop);
    inject(DestroyRef).onDestroy(() => disposed(this.desktop));
  }
}

describe('按桌面共享的应用服务', () => {
  it('首次使用才创建，跨窗口复用；另一桌面独立，随各自桌面释放', () => {
    configureServices([]);
    const desktop = (name: string) =>
      Injector.create({ providers: [DesktopAppServices, { provide: desktopName, useValue: name }] });
    const first = desktop('first');
    const second = desktop('second');
    const services = first.get(DesktopAppServices);
    expect(created).not.toHaveBeenCalled();
    expect(services.get(Feature)).toBe(services.get(Feature));
    expect(second.get(DesktopAppServices).get(Feature).desktop).toBe('second');
    expect(created.mock.calls).toEqual([['first'], ['second']]);
    first.destroy();
    expect(disposed.mock.calls).toEqual([['first']]);
    second.destroy();
    expect(disposed.mock.calls).toEqual([['first'], ['second']]);
  });
});
