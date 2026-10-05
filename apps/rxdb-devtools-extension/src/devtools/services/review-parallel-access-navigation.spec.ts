import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InspectedPageAccessService } from './inspected-page-access.service';
import { PortService } from './port.service';

afterEach(() => {
  TestBed.resetTestingModule();
  vi.unstubAllGlobals();
});

const createAccess = () => {
  const grant = Promise.withResolvers<boolean>();
  const activateTab = vi.fn();
  const navigations = new Set<(url: string) => void>();
  vi.stubGlobal('chrome', {
    permissions: {
      contains: vi.fn(async () => false),
      request: vi.fn(() => grant.promise)
    },
    devtools: {
      inspectedWindow: {
        eval: (_code: string, callback: (result: string) => void) => callback('https://old.example/app')
      },
      network: {
        onNavigated: {
          addListener: (listener: (url: string) => void) => navigations.add(listener),
          removeListener: (listener: (url: string) => void) => navigations.delete(listener)
        }
      }
    }
  });
  TestBed.configureTestingModule({
    providers: [
      InspectedPageAccessService,
      { provide: PortService, useValue: { activateTab, notifyNavigation: vi.fn() } }
    ]
  });
  return { service: TestBed.inject(InspectedPageAccessService), grant, activateTab, navigations };
};

describe('并行评审：站点授权必须绑定当前导航与生命周期', () => {
  it('对照：未导航的授权结果可激活当前 tab', async () => {
    const { service, grant, activateTab } = createAccess();
    await vi.waitFor(() => expect(service.state()).toBe('required'));
    const request = service.requestAccess();
    grant.resolve(true);
    await expect(request).resolves.toBe(true);
    expect(service.state()).toBe('granted');
    expect(activateTab).toHaveBeenCalledOnce();
  });

  it('导航到不支持的页面后，旧 origin 授权不能将其改为 granted', async () => {
    const { service, grant, activateTab, navigations } = createAccess();
    await vi.waitFor(() => expect(service.state()).toBe('required'));
    const request = service.requestAccess();
    navigations.forEach(listener => listener('chrome://settings'));
    expect(service.state()).toBe('unsupported');
    grant.resolve(true);
    await request;
    expect.soft(service.state()).toBe('unsupported');
    expect(activateTab).not.toHaveBeenCalled();
  });

  it('销毁后的旧授权不能重新激活 tab', async () => {
    const { service, grant, activateTab } = createAccess();
    await vi.waitFor(() => expect(service.state()).toBe('required'));
    const request = service.requestAccess();
    service.ngOnDestroy();
    grant.resolve(true);
    await request;
    expect(activateTab).not.toHaveBeenCalled();
  });
});
