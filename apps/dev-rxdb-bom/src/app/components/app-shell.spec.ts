import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BomDemoService } from '../bom-demo.service';
import { AppShell } from './app-shell';

const mount = async () => {
  const service = {
    ready: signal(true),
    itemCount: signal(41),
    dataRevision: signal(0),
    resetting: signal(false),
    resetStatus: signal(''),
    connectExisting: vi.fn().mockResolvedValue(undefined),
    resetAndSeed: vi.fn().mockResolvedValue(undefined)
  };
  TestBed.configureTestingModule({
    imports: [AppShell],
    providers: [provideRouter([]), { provide: BomDemoService, useValue: service }]
  });
  const fixture = TestBed.createComponent(AppShell);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  const reset = Array.from(root.querySelectorAll('button')).find(button => button.textContent?.includes('重置'));
  if (!reset) throw new Error('缺少重置演示数据入口');
  await vi.waitFor(() => {
    fixture.detectChanges();
    expect(reset.disabled).toBe(false);
  });
  return { fixture, root, reset, service };
};

beforeEach(() => {
  Object.defineProperty(window, 'confirm', { configurable: true, writable: true, value: vi.fn() });
});

afterEach(() => {
  TestBed.resetTestingModule();
  vi.restoreAllMocks();
  Reflect.deleteProperty(window, 'confirm');
});

describe('BOM 工作区交互', () => {
  it('取消重置时保留现有数据，确认文案明确说明清空范围', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { fixture, reset, service } = await mount();
    reset.click();
    await fixture.whenStable();
    expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/清空.*演示.*恢复/s));
    expect(service.resetAndSeed).not.toHaveBeenCalled();
    expect(service.ready()).toBe(true);
  });

  it('确认重置后只执行一次，并回到概览完成下一步引导', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { fixture, reset, service } = await mount();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    reset.click();
    await fixture.whenStable();
    expect(confirm).toHaveBeenCalledOnce();
    expect(service.resetAndSeed).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith('/');
    expect(reset.disabled).toBe(false);
  });

  it('重置失败保留错误原因并允许重试', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { fixture, reset, root, service } = await mount();
    service.resetAndSeed.mockRejectedValueOnce(new Error('测试恢复失败'));
    reset.click();
    await fixture.whenStable();
    expect(root.querySelector('[role=alert]')?.textContent).toContain('测试恢复失败');
    expect(reset.disabled).toBe(false);
  });

  it('导航菜单可以展开并用 Escape 关闭', async () => {
    const { fixture, root } = await mount();
    const toggle = root.querySelector<HTMLButtonElement>('[aria-controls=bom-navigation]');
    expect(toggle).not.toBeNull();
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    toggle?.click();
    await fixture.whenStable();
    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
    const link = root.querySelector<HTMLAnchorElement>('a[aria-label="成本卷算"]');
    link?.focus();
    link?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(toggle);
  });

  it('打开导航时进入当前页面链接并阻止背景参与键盘导航', async () => {
    const { fixture, root } = await mount();
    root.querySelector<HTMLButtonElement>('[aria-controls=bom-navigation]')!.click();
    await fixture.whenStable();
    expect(root.querySelector('#bom-navigation')?.contains(document.activeElement)).toBe(true);
    expect(root.querySelector('.workspace')?.hasAttribute('inert')).toBe(true);
  });
});
