import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminAccountMenu } from './admin-account-menu';

beforeEach(() => TestBed.configureTestingModule({ imports: [AdminAccountMenu], providers: [provideRouter([])] }).compileComponents());
afterEach(() => TestBed.resetTestingModule());
function setup() {
  const fixture = TestBed.createComponent(AdminAccountMenu);
  fixture.componentRef.setInput('userId', '123456789012');
  fixture.componentRef.setInput('email', 'owner@example.test');
  fixture.componentRef.setInput('displayName', '小明');
  fixture.detectChanges();
  return fixture;
}

describe('顶栏账户菜单', () => {
  it('默认只显示名称和邮箱，打开后才显示账户详情与退出', async () => {
    const fixture = setup();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('小明');
    expect(root.textContent).toContain('owner@example.test');
    expect(root.querySelector('[role="menu"]')).toBeNull();
    root.querySelector<HTMLButtonElement>('.account-trigger')!.click();
    await fixture.whenStable();
    expect(root.querySelector('[role="menu"]')?.textContent).toContain('账户详情');
    expect(root.querySelector('[role="menu"]')?.textContent).toContain('退出登录');
    expect(root.querySelector('a')?.getAttribute('href')).toBe('/account');
    root.querySelector('a')!.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    expect(fixture.componentInstance.open()).toBe(false);
  });

  it('方向键在菜单中切换，Escape 关闭并把焦点交回身份按钮', async () => {
    const fixture = setup();
    const root = fixture.nativeElement as HTMLElement;
    document.body.appendChild(root);
    const trigger = root.querySelector<HTMLButtonElement>('.account-trigger')!;
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    await fixture.whenStable();
    const items = root.querySelectorAll<HTMLElement>('[role="menuitem"]');
    expect(document.activeElement).toBe(items[0]);
    items[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(items[1]);
    items[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();
    expect(root.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    root.remove();
  });

  it('失焦、外部点击和点击退出都会关闭菜单', async () => {
    const fixture = setup();
    const menu = fixture.componentInstance;
    menu.show();
    await fixture.whenStable();
    menu.focusOut(new FocusEvent('focusout', { relatedTarget: document.body }));
    expect(menu.open()).toBe(false);
    menu.show();
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(menu.open()).toBe(false);
    const logout = vi.fn();
    menu.logout.subscribe(logout);
    menu.show();
    menu.signOut();
    expect(menu.open()).toBe(false);
    expect(logout).toHaveBeenCalledOnce();
  });

  it('支持首尾与循环导航，内部焦点不关闭，关闭后不再抢回焦点', async () => {
    const fixture = setup();
    const root = fixture.nativeElement as HTMLElement;
    const menu = fixture.componentInstance;
    const trigger = root.querySelector<HTMLButtonElement>('.account-trigger')!;
    trigger.click();
    await fixture.whenStable();
    menu.focusOut(new FocusEvent('focusout', { relatedTarget: trigger }));
    const inside = new Event('pointerdown', { bubbles: true });
    trigger.dispatchEvent(inside);
    expect(menu.open()).toBe(true);
    menu.show(true);
    await fixture.whenStable();
    const items = root.querySelectorAll<HTMLElement>('[role="menuitem"]');
    expect(document.activeElement).toBe(items[1]);
    menu.move(new KeyboardEvent('keydown', { key: 'Home' }));
    expect(document.activeElement).toBe(items[0]);
    menu.move(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    expect(document.activeElement).toBe(items[1]);
    menu.move(new KeyboardEvent('keydown', { key: 'End' }));
    expect(document.activeElement).toBe(items[1]);
    const tab = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true });
    menu.move(tab);
    expect(tab.defaultPrevented).toBe(false);
    trigger.click();
    expect(menu.open()).toBe(false);
    const escape = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    menu.escape(escape);
    expect(escape.defaultPrevented).toBe(false);
    menu.show();
    menu.close();
    await fixture.whenStable();
    expect(menu.open()).toBe(false);
  });

});
