import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { AppHeader } from './app-header';
import { DemoSession } from './demo-session';

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
});
