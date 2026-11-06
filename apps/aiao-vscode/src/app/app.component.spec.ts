import { RxDB } from '@aiao/rxdb';
import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of, Subject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { savePendingOAuth } from '../workbench/git/github/github-oauth-bridge.js';
import { AppComponent } from './app.component';

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

describe('AppComponent workbench mount', () => {
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
