import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router, withHashLocation } from '@angular/router';
import type { DirectoryEntry } from '@modules/rxdb-devtools-panel/wire';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppComponent } from './app.component';
import { routes } from './app.routes';
import { createFakePanelHost, type FakePanelHost } from './testing';

/**
 * 目录快照：只为让 OPFS 页走到「有数据」分支，内容本身不是本 spec 的判据。
 */
const FAKE_DIRECTORY: Record<string, DirectoryEntry> = {
  '.': {
    name: '.',
    kind: 'directory',
    relativePath: '',
    entries: {
      'demo.txt': { name: 'demo.txt', kind: 'file', relativePath: 'demo.txt', size: 12, type: 'text/plain' }
    }
  }
};

/** 每条路由与它渲染出的页面宿主元素。 */
const ROUTES = [
  ['/events', 'app-events-page'],
  ['/database', 'app-database-page'],
  ['/opfs', 'app-opfs-page'],
  ['/storage', 'app-storage-page'],
  ['/settings', 'app-settings-page']
] as const;

/**
 * AC#33：面板在**没有任何宿主全局**的环境里完整装配。
 *
 * @remarks
 * 判据不是「某个服务能 new 出来」，而是整机跑通：真实的 `AppComponent` + 真实路由 +
 * 真实的五个页面组件，宿主侧只喂 {@link createFakePanelHost} 的四条 provider。
 * 面板若还残留一处 `chrome.*`，这里就会当场抛 `ReferenceError` 而不是等到
 * Electron / Tauri 宿主运行时才炸。
 */
describe('panel assembly on a fake host', () => {
  let host: FakePanelHost;
  let fixture: ComponentFixture<AppComponent>;
  let router: Router;

  beforeEach(async () => {
    host = createFakePanelHost();
    host.fileChannel.respondWith(() => ({ requestId: '', structure: FAKE_DIRECTORY }));
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideRouter(routes, withHashLocation()), ...host.providers]
    });
    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(AppComponent);
    await fixture.whenStable();
  });

  afterEach(() => TestBed.resetTestingModule());

  // 这条先跑：后面所有断言的意义都建立在「环境里真的没有 chrome」之上。
  it('runs without any host global in scope', () => {
    expect('chrome' in globalThis).toBe(false);
    expect('browser' in globalThis).toBe(false);
    expect('__TAURI__' in globalThis).toBe(false);
  });

  it('renders the shell before the page ever connects', () => {
    fixture.detectChanges();
    const shell = fixture.nativeElement as HTMLElement;

    expect(shell.querySelector('app-header')).not.toBeNull();
    expect(shell.querySelector('app-toast')).not.toBeNull();
    expect(shell.textContent).toContain('未连接');
    expect(shell.querySelectorAll('[role="tab"]')).toHaveLength(ROUTES.length);
  });

  it('turns a handshake into connected state and the follow-up queries', async () => {
    host.transport.emit('HANDSHAKE');
    await fixture.whenStable();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('已连接');
    expect(host.transport.sent.map(message => message.type)).toEqual(['GET_BRANCHES', 'INSPECT_DB']);
  });

  it.each(ROUTES)('renders %s through the real router', async (path, selector) => {
    host.transport.emit('HANDSHAKE');
    await router.navigate([path]);
    await fixture.whenStable();
    fixture.detectChanges();

    const page = (fixture.nativeElement as HTMLElement).querySelector(selector);
    expect(page).not.toBeNull();
    // 守卫放行后才有内容；只要还卡在「等待连接」就说明装配没打通。
    expect(page?.textContent).not.toContain('Waiting for RxDB connection');
  });

  it('shows the access prompt the host reports instead of page content', async () => {
    host.transport.emit('HANDSHAKE');
    host.hostAccess.state.set('required');
    host.hostAccess.error.set('未授予当前站点访问权限');
    await router.navigate(['/events']);
    await fixture.whenStable();
    fixture.detectChanges();

    const page = (fixture.nativeElement as HTMLElement).querySelector('app-events-page');
    expect(page?.textContent).toContain('允许访问当前站点');
    expect(page?.textContent).toContain('未授予当前站点访问权限');
  });

  it('reaches the fake file channel from the OPFS page', async () => {
    host.transport.emit('HANDSHAKE');
    await router.navigate(['/opfs']);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(host.fileChannel.requests.map(request => request.message)).toEqual(['getDirectoryStructure']);
    expect((fixture.nativeElement as HTMLElement).querySelector('app-opfs-page')?.textContent).toContain('demo.txt');
  });
});
