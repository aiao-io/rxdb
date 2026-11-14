import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SyncTargetSettings } from './sync-target-settings';

afterEach(() => {
  TestBed.resetTestingModule();
  vi.unstubAllGlobals();
});

function render(inputs: Record<string, unknown> = {}) {
  const fixture = TestBed.createComponent(SyncTargetSettings);
  for (const [name, value] of Object.entries({
    kind: 'platform',
    platformAvailable: true,
    nativeMode: false,
    configured: true,
    busy: false,
    message: '',
    ...inputs
  }))
    fixture.componentRef.setInput(name, value);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  const button = (label: string) =>
    Array.from(root.querySelectorAll('button')).find(item => item.textContent?.trim() === label);
  return { fixture, root, button };
}

describe('平台账号同步设置', () => {
  it('注册登录入口可用，页面没有项目配置也不探测管理授权', () => {
    const request = vi.fn();
    vi.stubGlobal('fetch', request);
    const { fixture, root, button } = render();
    const login = vi.fn();
    fixture.componentInstance.login.subscribe(login);
    expect(root.textContent).toContain('注册或登录平台账号');
    expect(root.textContent).toContain('API Key 不同步');
    expect(root.querySelector('input, select, details, a[download]')).toBeNull();
    expect(root.textContent).not.toMatch(/Supabase|SQL|OAuth|项目 URL/);
    expect(request).not.toHaveBeenCalled();
    button('注册 / 登录与同步设置')!.click();
    expect(login).toHaveBeenCalledTimes(1);
  });

  it('没有平台配置时说明服务不可用，不提供用户项目入口', () => {
    const { root, button } = render({ kind: 'disconnected', platformAvailable: false, configured: false });
    expect(root.textContent).toContain('平台账号服务暂不可用');
    expect(root.textContent).toContain('联系服务方');
    expect(button('注册 / 登录与同步设置')).toBeUndefined();
    expect(button('使用平台账号')).toBeUndefined();
    expect(root.querySelector('input, select, details')).toBeNull();
  });

  it('旧目标断开后须显式选择平台账号，不自动连接', () => {
    const { fixture, button } = render({ kind: 'disconnected', configured: false });
    const changeTarget = vi.fn();
    fixture.componentInstance.changeTarget.subscribe(changeTarget);
    expect(changeTarget).not.toHaveBeenCalled();
    expect(button('注册 / 登录与同步设置')).toBeUndefined();
    button('使用平台账号')!.click();
    expect(changeTarget).toHaveBeenCalledWith('platform');
  });

  it('进行中的同步禁止更改服务和重复打开账号设置', () => {
    const { button } = render({ busy: true });
    expect(button('断开同步服务')?.disabled).toBe(true);
    expect(button('注册 / 登录与同步设置')?.disabled).toBe(true);
  });

  it('可显式断开平台服务，操作消息和桌面存储边界可见', () => {
    const { fixture, root, button } = render({ nativeMode: true, message: '同步已停止，本机内容保留。' });
    const changeTarget = vi.fn();
    fixture.componentInstance.changeTarget.subscribe(changeTarget);
    expect(root.textContent).toContain('应用的数据目录');
    expect(root.querySelector('[role="status"]')?.textContent).toContain('同步已停止');
    button('断开同步服务')!.click();
    expect(changeTarget).toHaveBeenCalledWith('disconnected');
  });
});
