import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InspectedPageAccessService, permissionPatternForUrl } from './inspected-page-access.service';
import { PortService } from './port.service';

class PortStub {
  readonly activateTab = vi.fn();
  readonly notifyNavigation = vi.fn();
}

describe('permissionPatternForUrl', () => {
  it.each([
    ['https://example.com/path?q=1', 'https://example.com/*'],
    ['http://localhost:4200/app', 'http://localhost/*'],
    ['file:///tmp/app.html', 'file:///*']
  ])('maps %s to the narrow host permission %s', (url, expected) => {
    expect(permissionPatternForUrl(url)).toBe(expected);
  });

  it.each(['chrome://extensions', 'about:blank', 'not a url'])('rejects unsupported inspected URLs: %s', url => {
    expect(permissionPatternForUrl(url)).toBeNull();
  });
});

describe('InspectedPageAccessService', () => {
  let port: PortStub;
  let contains: ReturnType<typeof vi.fn>;
  let request: ReturnType<typeof vi.fn>;
  let navigationListener: ((url: string) => void) | null;
  let removeListener: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    port = new PortStub();
    contains = vi.fn(async () => false);
    request = vi.fn(async () => false);
    navigationListener = null;
    removeListener = vi.fn();
    vi.stubGlobal('chrome', {
      permissions: { contains, request },
      devtools: {
        inspectedWindow: {
          eval: vi.fn((_expression: string, callback: (result: unknown) => void) => {
            callback('https://example.com/app');
          })
        },
        network: {
          onNavigated: {
            addListener: vi.fn((listener: (url: string) => void) => {
              navigationListener = listener;
            }),
            removeListener
          }
        }
      }
    } as unknown as typeof chrome);
    TestBed.configureTestingModule({
      providers: [InspectedPageAccessService, { provide: PortService, useValue: port }]
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });

  it('requires an explicit user grant before activating the inspected tab', async () => {
    const service = TestBed.inject(InspectedPageAccessService);
    await vi.waitFor(() => expect(service.state()).toBe('required'));

    expect(contains).toHaveBeenCalledWith({ origins: ['https://example.com/*'] });
    expect(port.activateTab).not.toHaveBeenCalled();

    request.mockResolvedValueOnce(true);
    await expect(service.requestAccess()).resolves.toBe(true);

    expect(request).toHaveBeenCalledWith({ origins: ['https://example.com/*'] });
    expect(service.state()).toBe('granted');
    expect(port.activateTab).toHaveBeenCalledOnce();
  });

  it('keeps denial visible and does not activate', async () => {
    const service = TestBed.inject(InspectedPageAccessService);
    await vi.waitFor(() => expect(service.state()).toBe('required'));

    await expect(service.requestAccess()).resolves.toBe(false);

    expect(service.state()).toBe('required');
    expect(service.error()).toBe('未授予当前站点访问权限');
    expect(port.activateTab).not.toHaveBeenCalled();
  });

  it('uses devtools navigation events to reset and reactivate without a timer', async () => {
    contains.mockResolvedValue(true);
    const service = TestBed.inject(InspectedPageAccessService);
    await vi.waitFor(() => expect(port.activateTab).toHaveBeenCalledOnce());
    port.activateTab.mockClear();

    navigationListener?.('https://next.example/path');
    await vi.waitFor(() => expect(port.activateTab).toHaveBeenCalledOnce());

    expect(port.notifyNavigation).toHaveBeenCalledOnce();
    expect(contains).toHaveBeenLastCalledWith({ origins: ['https://next.example/*'] });
    service.ngOnDestroy();
    expect(removeListener).toHaveBeenCalledOnce();
  });

  it('marks restricted pages as unsupported', async () => {
    const service = TestBed.inject(InspectedPageAccessService);
    navigationListener?.('chrome://settings');
    await vi.waitFor(() => expect(service.state()).toBe('unsupported'));

    expect(port.notifyNavigation).toHaveBeenCalledOnce();
    expect(port.activateTab).not.toHaveBeenCalled();
  });
});
