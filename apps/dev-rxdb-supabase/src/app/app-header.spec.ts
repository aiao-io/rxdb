import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { AppHeader } from './app-header';
import { AppService } from './app.service';
import { DemoSession } from './demo-session';
import { RemoteSyncState } from './remote-sync-state';

function renderHeader(session: Partial<DemoSession>) {
  TestBed.configureTestingModule({
    imports: [AppHeader],
    providers: [{ provide: DemoSession, useValue: { $switching: signal(false), switchTo: vi.fn(), ...session } }]
  });
  const fixture = TestBed.createComponent(AppHeader);
  fixture.detectChanges();
  const select = fixture.nativeElement.querySelector('select[aria-label="切换身份"]') as HTMLSelectElement | null;
  return { fixture, select };
}

describe('AppHeader', () => {
  it('切换菜单选中的是当前身份，不是第一项', () => {
    const { select } = renderHeader({ description: { title: 'Alice', detail: '星河零售' }, currentChoice: 'alice' });

    expect(select?.value).toBe('alice');
  });

  it('选了另一个身份就去切换', () => {
    const switchTo = vi.fn();
    const { select } = renderHeader({
      description: { title: '访客', detail: '未登录' },
      currentChoice: 'visitor',
      switchTo
    });

    select!.value = 'bob';
    select!.dispatchEvent(new Event('change'));

    expect(switchTo).toHaveBeenCalledWith('bob');
  });

  it('本地模式没有身份：不显示切换菜单', () => {
    const { select } = renderHeader({ description: undefined, currentChoice: null });

    expect(select).toBeNull();
  });

  // 安全提示不再在每个页面顶部占一整行，收成顶栏上的一个图标
  it('远端同步连上时，顶栏有同步提示图标', () => {
    const { fixture } = renderHeader({ description: { title: 'Alice', detail: '星河零售' }, currentChoice: 'alice' });

    TestBed.inject(RemoteSyncState).markConnected(true);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="remote-security-toggle"]')).not.toBeNull();
  });

  // 窄屏上侧栏默认收起成抽屉，顶栏要有打开它的入口（宽屏由 md:hidden 隐藏）
  it('菜单按钮开合侧栏', () => {
    const { fixture } = renderHeader({ description: undefined, currentChoice: null });
    const app = TestBed.inject(AppService);
    const before = app.$sidebarPinned();

    (fixture.nativeElement.querySelector('button[aria-label="菜单"]') as HTMLButtonElement).click();

    expect(app.$sidebarPinned()).toBe(!before);
  });
});
