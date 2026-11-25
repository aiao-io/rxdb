import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { RemoteSecurityNotice } from './remote-security-notice';
import { RemoteSyncState } from './remote-sync-state';

/** 提示框经 CDK overlay 渲染，不在组件自己的 DOM 里，按整个文档查 */
function panel(): HTMLElement | null {
  return document.querySelector('[data-testid="remote-security-notice"]');
}

function render(connected: boolean) {
  TestBed.configureTestingModule({ imports: [RemoteSecurityNotice] });
  const fixture = TestBed.createComponent(RemoteSecurityNotice);
  TestBed.inject(RemoteSyncState).markConnected(connected);
  fixture.detectChanges();
  const toggle = fixture.nativeElement.querySelector(
    '[data-testid="remote-security-toggle"]'
  ) as HTMLButtonElement | null;
  const click = (target: HTMLElement) => {
    target.click();
    fixture.detectChanges();
  };
  return { fixture, toggle, click };
}

describe('RemoteSecurityNotice', () => {
  it('纯本地模式没有远端同步，不显示图标', () => {
    const { toggle } = render(false);

    expect(toggle).toBeNull();
  });

  it('远端连上时只占一个图标，提示默认收起', () => {
    const { toggle } = render(true);

    expect(toggle?.getAttribute('aria-label')).toContain('远端同步已连接');
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    expect(panel()).toBeNull();
  });

  it('点图标展开安全提示：分清两种同步模型的可见范围', () => {
    const { toggle, click } = render(true);

    click(toggle!);

    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
    expect(panel()?.getAttribute('role')).toBe('dialog');
    expect(panel()?.textContent).toContain('未分区的日志同步');
    expect(panel()?.textContent).toContain('按身份分区同步');
    expect(panel()?.textContent).toContain('createdBy');
  });

  // 连接自检不再查 todos（见 DEMO_RLS_CHECK），这条事实改由提示说清楚
  it('写明本地栈的 todos 表没开 RLS', () => {
    const { toggle, click } = render(true);

    click(toggle!);

    expect(panel()?.textContent).toContain('todos 表没开 RLS');
  });

  it('再点一次图标就收起', () => {
    const { toggle, click } = render(true);

    click(toggle!);
    click(toggle!);

    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    expect(panel()).toBeNull();
  });

  it('点提示框之外就收起', () => {
    const { toggle, click } = render(true);

    click(toggle!);
    click(document.body);

    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    expect(panel()).toBeNull();
  });

  it('按 Esc 收起', () => {
    const { fixture, toggle, click } = render(true);

    click(toggle!);
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
    fixture.detectChanges();

    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    expect(panel()).toBeNull();
  });
});
