import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
    expect(hrefs).toEqual(['/home', '/todo', '/todo-cursor']);
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
