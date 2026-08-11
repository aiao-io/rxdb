import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppComponent } from './app.component';
import { AppService } from './app.service';
import { AppHeader } from './components/app-header';

// TAURI-06：外壳布局此前完全没有渲染测试 —— 侧边栏开关是纯模板绑定，
// 写错了既不会编译报错也不会有任何门禁拦住。
describe('app shell', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideRouter([])]
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  it('toggles the sidebar from the header button', async () => {
    const fixture = TestBed.createComponent(AppHeader);
    await fixture.whenStable();
    const app = TestBed.inject(AppService);
    const before = app.$sidebarPinned();

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('button[aria-label="Toggle menu"]')
      ?.click();

    expect(app.$sidebarPinned()).toBe(!before);
  });

  it('renders sidebar, header and router outlet', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    await fixture.whenStable();
    const host: HTMLElement = fixture.nativeElement;

    expect(host.querySelector('app-sidebar')).not.toBeNull();
    expect(host.querySelector('app-header')).not.toBeNull();
    expect(host.querySelector('router-outlet')).not.toBeNull();
  });

  it('mirrors the sidebar state onto the root host class', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = TestBed.inject(AppService);
    app.$sidebarPinned.set(true);
    await fixture.whenStable();

    expect(fixture.nativeElement.classList.contains('left-menu-pinned')).toBe(true);

    app.$sidebarPinned.set(false);
    await fixture.whenStable();

    expect(fixture.nativeElement.classList.contains('left-menu-pinned')).toBe(false);
  });
});
