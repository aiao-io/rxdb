import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { INSPECTED_WINDOW_SCRIPT_RESULT } from '@aiao/rxdb-devtools-panel';
import { RXDB_DEVTOOLS_MESSAGE, type DevToolsMessage } from '@aiao/rxdb-devtools-panel/wire';
import { InspectedPageAccessService, permissionPatternForUrl } from './inspected-page-access.service';
import { PortService } from './port.service';

class PortStub {
  private listener: ((message: DevToolsMessage) => void) | null = null;

  readonly activateTab = vi.fn();
  readonly notifyNavigation = vi.fn();
  readonly unsubscribe = vi.fn(() => {
    this.listener = null;
  });
  readonly subscribe = vi.fn((listener: (message: DevToolsMessage) => void) => {
    this.listener = listener;
    return this.unsubscribe;
  });

  emitScriptResult(payload: unknown): void {
    this.listener?.({
      source: RXDB_DEVTOOLS_MESSAGE,
      direction: 'page-to-devtools',
      type: INSPECTED_WINDOW_SCRIPT_RESULT,
      payload,
      timestamp: 0,
      sequence: 0
    });
  }
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
  let reload: ReturnType<typeof vi.fn>;
  // 非 `location.href` 的求值（即面板注入的脚本）返回的启动应答，由用例按需设定。
  let scriptStartup: unknown;

  beforeEach(() => {
    port = new PortStub();
    contains = vi.fn(async () => false);
    request = vi.fn(async () => false);
    navigationListener = null;
    removeListener = vi.fn();
    reload = vi.fn();
    scriptStartup = undefined;
    vi.stubGlobal('chrome', {
      permissions: { contains, request },
      devtools: {
        inspectedWindow: {
          reload,
          eval: vi.fn((expression: string, callback: (result: unknown) => void) => {
            callback(expression === 'location.href' ? 'https://example.com/app' : scriptStartup);
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

  // 面板只会调 token 上的 reloadInspectedPage()，`{}` 这个 Chrome 形参归本适配器所有。
  it('reloads the inspected page through the devtools API', () => {
    TestBed.inject(InspectedPageAccessService).reloadInspectedPage();

    expect(reload).toHaveBeenCalledWith({});
  });

  it('starts panel scripts in the inspected window and resolves the matching result', async () => {
    scriptStartup = { started: true, requestId: 'download-request' };
    const service = TestBed.inject(InspectedPageAccessService);

    const pending = service.evaluate<string>('serialized-code', 'download-request');
    await vi.waitFor(() => expect(port.subscribe).toHaveBeenCalledOnce());

    // 先投一条别人的结果：requestId 不匹配就不能兑现这次求值。
    port.emitScriptResult({ requestId: 'other-request', success: true, result: 'wrong' });
    port.emitScriptResult({ requestId: 'download-request', success: true, result: 'tar-bytes' });

    await expect(pending).resolves.toBe('tar-bytes');
    expect(port.unsubscribe).toHaveBeenCalledOnce();
  });

  it('rejects when the inspected page refuses to start the script', async () => {
    scriptStartup = undefined;
    const service = TestBed.inject(InspectedPageAccessService);

    await expect(service.evaluate('serialized-code', 'download-request')).rejects.toThrow('页面脚本未成功启动');
    expect(port.unsubscribe).toHaveBeenCalledOnce();
  });
});
