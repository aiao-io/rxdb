import { RxDB } from '@aiao/rxdb';
import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of, Subject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { savePendingOAuth } from '../workbench/git/github/github-oauth-bridge.js';
import { AppComponent } from './app.component';
import { ORBIT_CLIENT } from './orbit-embedding';

const mocks = vi.hoisted(() => ({
  mount: vi.fn(),
  dispose: vi.fn(),
  change: vi.fn(),
  cursor: vi.fn(),
  gitBackend: vi.fn(() => ({ dispose: vi.fn() })),
  githubService: vi.fn(() => ({
    createBackend: vi.fn(() => ({ dispose: vi.fn() })),
    auth: { completeOAuth: mocks.completeOAuth },
    api: {}
  })),
  routerBackend: vi.fn((options: { local: unknown; github: unknown }) => options.local),
  completeOAuth: vi.fn(async () => ({ token: 'gho_abc', login: 'octo', avatarUrl: null, provider: 'oauth' }))
}));
vi.mock('../workbench/mount.js', () => ({ mountWorkbench: mocks.mount }));
/** 运行时宿主的部署配置，按用例换成不同的表。 */
const hosts = vi.hoisted(() => ({ table: {} as Record<string, Record<string, string>> }));
vi.mock('../runtime-hosts/hosts.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../runtime-hosts/hosts.js')>()),
  get RUNTIME_HOSTS() {
    return hosts.table;
  }
}));
vi.mock('../workbench/git-backend.js', () => ({ createGitBackend: mocks.gitBackend }));
vi.mock('../workbench/git/github/github-service.js', () => ({ createGitHubService: mocks.githubService }));
vi.mock('../workbench/git/git-router-backend.js', () => ({ createRouterBackend: mocks.routerBackend }));
vi.mock('../workbench/git/github/github-session-store.js', () => {
  let value: unknown = null;
  return {
    createIndexedDbSecretStore: () => ({
      load: async () => value,
      save: async (next: unknown) => {
        value = next;
      },
      clear: async () => {
        value = null;
      }
    })
  };
});
let editor: { update(value: string, language: string): void; layout(): void; focus(): void; dispose(): void };

const connected = new Subject<boolean>();
const mockRxDB = () => ({
  adapterConnected$: () => connected,
  entityManager: { getRepository: vi.fn(() => ({ findAll: vi.fn(() => of([])) })) }
});

function createComponentFixture() {
  TestBed.configureTestingModule({
    providers: [{ provide: RxDB, useValue: mockRxDB() }]
  });
  const fixture = TestBed.createComponent(AppComponent);
  return fixture;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.mount.mockImplementation((host, _options, mountEditor) => {
    const element = document.createElement('div');
    host.append(element);
    editor = mountEditor(element, {
      value: 'initial',
      language: 'plaintext',
      engine: 'codemirror',
      onChange: mocks.change,
      onCursor: mocks.cursor
    });
    return {
      dispose: () => {
        editor.dispose();
        mocks.dispose();
      }
    };
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  history.replaceState({}, '', '/');
});

describe('被 Aiao Desktop 嵌入时向桌面报告（US-410）', () => {
  /** 桌面给的连接：frame 为空表示桌面没有提供窗口；请求与就绪按发生顺序记下来。 */
  const desktop = (frame?: 'standard' | 'transparent') => {
    const order: string[] = [];
    const window = { platform: 'macos', frame, decorations: true, focused: true, maximized: false };
    return {
      order,
      context: { props: frame ? { 'orbit.window': window } : {} },
      bus: { $on: vi.fn(), $off: vi.fn() },
      request: vi.fn(async (method: string, payload: unknown = null) => {
        order.push(`${method}:${JSON.stringify(payload)}`);
        return null;
      }),
      ready: vi.fn(() => order.push('ready')),
      fail: vi.fn()
    };
  };

  function embeddedFixture(client: ReturnType<typeof desktop>) {
    TestBed.configureTestingModule({
      providers: [
        { provide: RxDB, useValue: mockRxDB() },
        { provide: ORBIT_CLIENT, useValue: client }
      ]
    });
    return TestBed.createComponent(AppComponent);
  }

  it('工作台挂载之后才报告就绪，连库期间不报告', async () => {
    const client = desktop();
    const fixture = embeddedFixture(client);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(client.ready).not.toHaveBeenCalled();
    connected.next(true);
    await vi.waitFor(() => expect(client.ready).toHaveBeenCalledOnce());
    expect(mocks.mount.mock.invocationCallOrder[0]).toBeLessThan(client.ready.mock.invocationCallOrder[0]);
    expect(client.fail).not.toHaveBeenCalled();
    fixture.destroy();
  });

  it('工作台挂载失败：向桌面报告原因，页面显示同一句话', async () => {
    mocks.mount.mockImplementation(() => {
      throw new Error('工作台挂载失败');
    });
    const client = desktop();
    const fixture = embeddedFixture(client);
    fixture.detectChanges();
    connected.next(true);
    await vi.waitFor(() => expect(client.fail).toHaveBeenCalledWith('工作台挂载失败'));
    expect(client.ready).not.toHaveBeenCalled();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('工作台挂载失败');
    fixture.destroy();
  });

  it('透明窗口（US-411）：工作台拿到宿主窗口，先隐藏桌面的标题栏、上报拖动区，再报告就绪', async () => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe(): void {}
        disconnect(): void {}
      }
    );
    const client = desktop('transparent');
    const fixture = embeddedFixture(client);
    fixture.detectChanges();
    connected.next(true);
    await vi.waitFor(() => expect(client.ready).toHaveBeenCalledOnce());
    const hostWindow = mocks.mount.mock.calls[0][1].hostWindow;
    expect(hostWindow?.state).toMatchObject({ frame: 'transparent', focused: true });
    expect(client.order.indexOf('window.setDecorations:false')).toBeGreaterThanOrEqual(0);
    expect(client.order.indexOf('window.setDecorations:false')).toBeLessThan(client.order.indexOf('ready'));
    await vi.waitFor(() => expect(client.order.some(entry => entry.startsWith('window.setDragRegions:'))).toBe(true));
    fixture.destroy();
    expect(client.order.at(-1)).toBe('window.setDragRegions:[]');
  });

  it('标准窗口或桌面没提供窗口：保留桌面的标题栏，不调用窗口接口', async () => {
    for (const frame of ['standard', undefined] as const) {
      TestBed.resetTestingModule();
      mocks.mount.mockClear();
      const client = desktop(frame);
      const fixture = embeddedFixture(client);
      fixture.detectChanges();
      connected.next(true);
      await vi.waitFor(() => expect(client.ready).toHaveBeenCalledOnce());
      expect(mocks.mount.mock.calls[0][1].hostWindow).toBeUndefined();
      expect(client.order).toEqual(['ready']);
      fixture.destroy();
    }
  });

  it('连库期间组件被销毁：不挂载，也不报告就绪', async () => {
    const client = desktop();
    const fixture = embeddedFixture(client);
    fixture.detectChanges();
    fixture.destroy();
    connected.next(true);
    await Promise.resolve();
    expect(client.ready).not.toHaveBeenCalled();
    expect(client.fail).not.toHaveBeenCalled();
  });
});

describe('AppComponent workbench mount', () => {
  it('按部署配置给工作台传当前来源对应的各运行时宿主源', async () => {
    hosts.table = {
      vivari: { [location.origin]: 'http://localhost:4331' },
      nodepod: { [location.origin]: 'http://localhost:4332', 'http://other.example': 'http://localhost:9999' }
    };
    const fixture = createComponentFixture();
    fixture.detectChanges();
    connected.next(true);
    await vi.waitFor(() => expect(mocks.mount).toHaveBeenCalledOnce());
    expect(mocks.mount.mock.calls[0][1]).toMatchObject({
      runtimeHosts: { vivari: 'http://localhost:4331', nodepod: 'http://localhost:4332' }
    });
    fixture.destroy();
  });

  it('当前来源不在部署配置里时不提供宿主源', async () => {
    hosts.table = { vivari: { 'http://localhost:4320': 'http://localhost:4331' } };
    const fixture = createComponentFixture();
    fixture.detectChanges();
    connected.next(true);
    await vi.waitFor(() => expect(mocks.mount).toHaveBeenCalledOnce());
    expect(mocks.mount.mock.calls[0][1]).toMatchObject({ runtimeHosts: {} });
    fixture.destroy();
  });

  it('waits for the database connection before mounting the workbench', async () => {
    const fixture = createComponentFixture();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(mocks.mount).not.toHaveBeenCalled();
    connected.next(true);
    await vi.waitFor(() => expect(mocks.mount).toHaveBeenCalledOnce());
    expect(mocks.mount.mock.calls[0][0]).toBe(fixture.nativeElement);
    fixture.destroy();
  });

  it('does not mount after the component is destroyed while waiting for the database', async () => {
    const fixture = createComponentFixture();
    fixture.detectChanges();
    fixture.destroy();
    connected.next(true);
    await Promise.resolve();
    expect(mocks.mount).not.toHaveBeenCalled();
  });

  it('Tab 缩进源码，Mod+Enter 保留 CodeMirror 的插入行行为', async () => {
    const fixture = createComponentFixture();
    fixture.detectChanges();
    connected.next(true);
    await vi.waitFor(() => expect(mocks.mount).toHaveBeenCalledOnce());
    await fixture.whenStable();
    const content = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.cm-content')!;
    content.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', code: 'Tab', keyCode: 9, bubbles: true, cancelable: true })
    );
    expect(mocks.change).toHaveBeenLastCalledWith(expect.stringMatching(/^\s+initial/));
    content.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        bubbles: true,
        cancelable: true,
        ...(/Mac|iPhone|iPad/.test(navigator.platform) ? { metaKey: true } : { ctrlKey: true })
      })
    );
    expect(mocks.change.mock.calls.at(-1)?.[0]).toContain('\n');
    fixture.destroy();
  });

  it('Mod+F 打开编辑器内查找面板', async () => {
    const fixture = createComponentFixture();
    fixture.detectChanges();
    connected.next(true);
    await vi.waitFor(() => expect(mocks.mount).toHaveBeenCalledOnce());
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
    const content = host.querySelector<HTMLElement>('.cm-content')!;
    const modifier = /Mac|iPhone|iPad/.test(navigator.platform) ? { metaKey: true } : { ctrlKey: true };
    content.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'f',
        code: 'KeyF',
        keyCode: 70,
        bubbles: true,
        cancelable: true,
        ...modifier
      })
    );
    expect(host.querySelector('.cm-panels-top .cm-search [main-field]')).not.toBeNull();
    fixture.destroy();
  });

  it('mounts the existing editor, updates values and disposes the workbench', async () => {
    const fixture = createComponentFixture();
    fixture.detectChanges();
    connected.next(true);
    await vi.waitFor(() => expect(mocks.mount).toHaveBeenCalledOnce());
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.cm-content')?.textContent).toBe('initial');
    editor.update('changed', 'plaintext');
    expect(host.querySelector('.cm-content')?.textContent).toBe('changed');
    editor.layout();
    host.querySelector('.cm-content')?.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
    expect(mocks.cursor).toHaveBeenCalledWith(1, 1);
    const paste = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(paste, 'clipboardData', { value: { getData: () => 'pasted', files: [] } });
    host.querySelector('.cm-content')?.dispatchEvent(paste);
    expect(mocks.change).toHaveBeenCalledWith(expect.stringContaining('pasted'));
    editor.focus();
    expect(document.activeElement).toBe(host.querySelector('.cm-content'));
    fixture.destroy();
    expect(() => {
      editor.layout();
      editor.focus();
    }).not.toThrow();
    expect(mocks.dispose).toHaveBeenCalledOnce();
  });

  it('falls back to the in-memory catalog when the adapter never connects', async () => {
    vi.useFakeTimers();
    try {
      const fixture = createComponentFixture();
      fixture.detectChanges();
      await vi.advanceTimersByTimeAsync(10000);
      await vi.waitFor(() => expect(mocks.mount).toHaveBeenCalledOnce());
      const options = mocks.mount.mock.calls[0][1] as { catalog: unknown; backend: unknown };
      expect(options.catalog).toBeUndefined();
      expect(options.backend).toBeDefined();
      fixture.destroy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not start browser workers during server rendering', () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: RxDB, useValue: { adapterConnected$: () => of(true) } },
        { provide: PLATFORM_ID, useValue: 'server' }
      ]
    });
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    expect(mocks.mount).not.toHaveBeenCalled();
    fixture.destroy();
  });

  it.each([null, {}])('closes the OAuth callback window when opener is %j', async opener => {
    vi.stubGlobal('opener', opener);
    const close = vi.spyOn(window, 'close').mockImplementation(() => undefined);
    const state = 'https://ide.example/github-callback?nonce=abcd1234abcd1234';
    await savePendingOAuth({ verifier: 'verifier-1', nonce: 'abcd1234abcd1234', state, at: Date.now() });
    history.pushState({}, '', `/github-callback?code=code-1&state=${encodeURIComponent(state)}`);
    const fixture = createComponentFixture();
    fixture.detectChanges();
    connected.next(true);
    await vi.waitFor(() => expect(mocks.completeOAuth).toHaveBeenCalledWith('code-1', 'verifier-1'));
    await vi.waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(location.pathname).toBe('/');
    expect(mocks.mount).toHaveBeenCalled();
    fixture.destroy();
  });

  it('keeps the OAuth callback window open when the token exchange fails', async () => {
    vi.stubGlobal('opener', null);
    const close = vi.spyOn(window, 'close').mockImplementation(() => undefined);
    mocks.completeOAuth.mockRejectedValueOnce(new Error('授权码交换失败'));
    const state = 'https://ide.example/github-callback?nonce=abcd1234abcd1234';
    await savePendingOAuth({ verifier: 'verifier-1', nonce: 'abcd1234abcd1234', state, at: Date.now() });
    history.pushState({}, '', `/github-callback?code=code-1&state=${encodeURIComponent(state)}`);
    const fixture = createComponentFixture();
    fixture.detectChanges();
    connected.next(true);
    await vi.waitFor(() => expect(fixture.componentInstance.error()).toBe('授权码交换失败'));
    expect(close).not.toHaveBeenCalled();
    fixture.destroy();
  });
});
