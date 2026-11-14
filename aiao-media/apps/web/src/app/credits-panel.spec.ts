import { TestBed } from '@angular/core/testing';
import { afterEach, expect, it, vi } from 'vitest';
import { CreditsPanel } from './credits-panel';
import { ProductClient } from './product-client';

afterEach(() => {
  TestBed.resetTestingModule();
  vi.restoreAllMocks();
});
const snapshot = { account: { balance: 10, reserved: 3, available: 7 }, entries: [] };
async function rig() {
  const fixture = TestBed.createComponent(CreditsPanel);
  const client = new ProductClient(async () => {
    throw new Error('禁止真实请求');
  });
  const credits = vi.spyOn(client, 'credits').mockResolvedValue(snapshot);
  fixture.componentRef.setInput('client', client);
  fixture.componentRef.setInput('identity', 'user-a');
  fixture.detectChanges();
  await fixture.whenStable();
  return { fixture, component: fixture.componentInstance, credits };
}
it('展示本人可用余额与预占，手动刷新读取同一账本', async () => {
  const { fixture, component, credits } = await rig();
  fixture.detectChanges();
  expect(fixture.nativeElement.textContent).toContain('可用积分 7');
  expect(fixture.nativeElement.textContent).toContain('预占 3');
  await component.load();
  expect(credits).toHaveBeenCalledTimes(2);
});
it('切换账号后不展示旧账号迟到结果，查询失败保留可重试提示', async () => {
  const { fixture, component, credits } = await rig();
  let resolve: (value: typeof snapshot) => void = () => undefined;
  credits.mockImplementationOnce(
    () =>
      new Promise(value => {
        resolve = value;
      })
  );
  const pending = component.load();
  fixture.componentRef.setInput('identity', '');
  fixture.detectChanges();
  resolve(snapshot);
  await pending;
  expect(component.snapshot()).toBeNull();
  credits.mockRejectedValue(new Error('余额暂不可读'));
  fixture.componentRef.setInput('identity', 'user-b');
  fixture.detectChanges();
  await fixture.whenStable();
  expect(component.message()).toBe('余额暂不可读');
  expect(component.snapshot()).toBeNull();
});

it('请求进行中不重复读取，非 Error 失败也给出可重试提示', async () => {
  const { component, credits } = await rig();
  let reject: (reason: unknown) => void = () => undefined;
  credits.mockImplementationOnce(
    () =>
      new Promise((_resolve, value) => {
        reject = value;
      })
  );
  const pending = component.load();
  await component.load();
  expect(credits).toHaveBeenCalledTimes(2);
  reject('不可公开的后端错误');
  await pending;
  expect(component.message()).toBe('积分暂不可读，请重试。');
  expect(component.snapshot()).toEqual(snapshot);
});
