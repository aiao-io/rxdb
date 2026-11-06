import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SyncTargetSettings } from './sync-target-settings';

afterEach(() => {
  TestBed.resetTestingModule();
  vi.unstubAllGlobals();
});

/** 按顺序给每次探测一个答案；'pending' 表示一直没有回应。 */
function stubStatus(...answers: (boolean | 'pending')[]) {
  const request = vi.fn();
  for (const answer of answers)
    request.mockImplementationOnce(() =>
      answer === 'pending' ?
        new Promise<Response>(() => undefined)
      : Promise.resolve(Response.json({ available: answer }))
    );
  vi.stubGlobal('fetch', request);
  return request;
}
/** 探测用的是原生 async，whenStable 不跟踪它：等状态离开 checking 再刷新视图。 */
async function settled(fixture: ComponentFixture<SyncTargetSettings>) {
  await vi.waitFor(() => expect(fixture.componentInstance.oauthStatus()).not.toBe('checking'));
  fixture.detectChanges();
}
function render() {
  const fixture = TestBed.createComponent(SyncTargetSettings);
  const inputs: Record<string, unknown> = {
    kind: 'disconnected',
    url: '',
    publicKey: '',
    platformAvailable: false,
    nativeMode: false,
    configured: false,
    busy: false,
    message: '',
    oauthProjects: [],
    oauthBusy: false
  };
  for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  const buttons = () => Array.from(root.querySelectorAll('button'));
  const connect = () => buttons().find(button => button.textContent?.includes('连接自己的 Supabase'));
  const recheck = () => buttons().find(button => button.textContent?.trim() === '重新检查');
  const hint = () => root.querySelector('p.notice[role="status"]');
  const manual = () => root.querySelector('details')!;
  return { fixture, connect, recheck, hint, manual };
}

describe('同步目标设置里的 Supabase 一键授权入口', () => {
  it('确认之前按钮保持禁用，不提前提示不可用', () => {
    stubStatus('pending');
    const { connect, hint, manual } = render();
    expect(connect()?.disabled).toBe(true);
    expect(hint()).toBeNull();
    expect(manual().open).toBe(false);
  });

  it('Worker 回答可用后才启用按钮，页面不出现不可用提示', async () => {
    const request = stubStatus(true);
    const { fixture, connect, hint, manual } = render();
    await settled(fixture);
    expect(request).toHaveBeenCalledTimes(1);
    expect(connect()?.disabled).toBe(false);
    expect(hint()).toBeNull();
    expect(manual().open).toBe(false);
  });

  it('部署方没有开通时隐藏按钮、写明原因并直接展开手动连接', async () => {
    stubStatus(false);
    const { fixture, connect, hint, manual } = render();
    await settled(fixture);
    expect(connect()).toBeUndefined();
    expect(hint()?.textContent).toContain('暂未开通');
    expect(hint()?.textContent).toContain('手动连接已有项目');
    expect(manual().open).toBe(true);
  });

  it('重新检查在部署开通后恢复按钮，提示随之消失', async () => {
    const request = stubStatus(false, true);
    const { fixture, connect, recheck, hint } = render();
    await settled(fixture);
    recheck()!.click();
    await settled(fixture);
    expect(request).toHaveBeenCalledTimes(2);
    expect(connect()?.disabled).toBe(false);
    expect(hint()).toBeNull();
  });

  it('点击按钮把连接请求交给上层处理', async () => {
    stubStatus(true);
    const { fixture, connect } = render();
    const connectOAuth = vi.fn();
    fixture.componentInstance.connectOAuth.subscribe(connectOAuth);
    await settled(fixture);
    connect()!.click();
    expect(connectOAuth).toHaveBeenCalledTimes(1);
  });
});
