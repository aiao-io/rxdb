import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { appRoutes } from '../app.routes';
import { AppMenu } from './app-menu';

const renderMenu = async () => {
  const fixture = TestBed.createComponent(AppMenu);
  await fixture.whenStable();
  return fixture;
};

describe('AppMenu', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideRouter([])]
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  // TAURI-06：这是本 app 第一条真正渲染组件的测试 —— 此前的 spec 全是纯函数
  // 与「读文件断言字符串」，模板里写错的 routerLink 不会被任何门禁拦住。
  it('renders one link per configured route', async () => {
    const fixture = await renderMenu();
    const hrefs = [...fixture.nativeElement.querySelectorAll('a')].map((a: HTMLAnchorElement) =>
      a.getAttribute('href')
    );

    // `/todo-cursor` 有路由却没有菜单入口 —— 除非手敲地址栏，这个 demo 页在
    // 桌面窗口里根本到不了（Tauri 默认不带地址栏）。
    // 顺序也一并钉住：`/storage` 紧跟 Home，与 Electron demo 的菜单同序。
    expect(hrefs).toEqual(['/home', '/storage', '/todo', '/todo-cursor']);
  });

  /**
   * 菜单与路由表必须一一对应。
   *
   * @remarks
   * 上一条测试把 href 逐个写死，能拦住「菜单里写错路径」，却拦不住「加了路由忘了加菜单」
   * ——那正是 `/todo-cursor` 当初的形态。这条按 `appRoutes` 反向核对，新增路由只要漏了
   * 菜单入口就会红，不必指望下一个人记得改上面那个数组。
   */
  it('covers every navigable route', async () => {
    const fixture = await renderMenu();
    const hrefs = [...fixture.nativeElement.querySelectorAll('a')].map((a: HTMLAnchorElement) =>
      a.getAttribute('href')
    );

    // `**` 是兜底重定向，不是可导航目的地。
    const navigable = appRoutes.filter(route => route.path !== '**').map(route => `/${String(route.path)}`);

    expect([...hrefs].sort()).toEqual([...navigable].sort());
  });

  it('renders section dividers without a link', async () => {
    const fixture = await renderMenu();
    const dividers = [...fixture.nativeElement.querySelectorAll('.menu-title')];

    expect(dividers).toHaveLength(1);
    expect(dividers[0].querySelector('a')).toBeNull();
    expect(dividers[0].textContent?.trim()).toBe('Todo Examples');
  });

  it('gives every link an icon', async () => {
    const fixture = await renderMenu();
    for (const link of fixture.nativeElement.querySelectorAll('a')) {
      expect(link.querySelector('svg')).not.toBeNull();
    }
  });
});
