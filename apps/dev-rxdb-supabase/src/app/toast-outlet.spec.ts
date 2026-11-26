import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { ToastOutlet } from './toast-outlet';
import { Toasts } from './toasts';

function render() {
  const fixture = TestBed.createComponent(ToastOutlet);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const toasts = TestBed.inject(Toasts);
  const all = () => [...element.querySelectorAll('[data-testid="toast"]')] as HTMLElement[];
  return { fixture, element, toasts, all };
}

describe('ToastOutlet', () => {
  it('一直挂着一个礼貌播报的区域；错误另外以 alert 播报', () => {
    const { fixture, element, toasts, all } = render();

    toasts.show({ kind: 'success', message: '拉取完成：拉到 2 条，落库 1 条', source: 'sync-round-1' });
    toasts.show({ kind: 'error', message: '推送失败：网络断了' });
    fixture.detectChanges();

    const region = element.querySelector('[data-testid="toasts"]');
    expect(region?.getAttribute('aria-live')).toBe('polite');
    expect(region?.getAttribute('aria-label')).toBe('消息');
    expect(all().map(toast => [toast.dataset['kind'], toast.getAttribute('role'), toast.textContent?.trim()])).toEqual([
      ['success', null, '拉取完成：拉到 2 条，落库 1 条'],
      ['error', 'alert', '推送失败：网络断了']
    ]);
    expect(all()[0].dataset['source']).toBe('sync-round-1');
  });

  it('点动作按钮执行动作并关掉这条；点关闭只关这条', () => {
    const { fixture, toasts, all } = render();
    const reload = vi.fn();
    toasts.show({ kind: 'error', message: '身份不匹配', action: { label: '重新加载', run: reload } });
    toasts.show({ kind: 'warning', message: '被拒 1 条' });
    fixture.detectChanges();

    (all()[0].querySelector('[data-testid="toast-action"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(reload).toHaveBeenCalledOnce();
    expect(all().map(toast => toast.textContent?.trim())).toEqual(['被拒 1 条']);

    (all()[0].querySelector('button[aria-label="关掉这条消息"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(all()).toHaveLength(0);
  });
});
