import { Window } from 'happy-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Identity } from '../model.js';
import { mountLogin } from './login-page.js';
import type { AuthSession } from './session.js';

let window: Window;
beforeEach(() => {
  window = new Window();
  vi.stubGlobal('document', window.document);
  vi.stubGlobal('window', window);
  vi.stubGlobal('navigator', { onLine: true });
  vi.stubGlobal('HTMLInputElement', window.HTMLInputElement);
});
afterEach(() => {
  vi.unstubAllGlobals();
});
/** 登录页用到的会话部分：身份、提示与验证码动作。 */
class FakeSession extends EventTarget {
  auth: object | undefined = {};
  user: Identity | null = null;
  message = '';
  messageTone = 'info';
  initialize = vi.fn(async () => undefined);
  sendCode = vi.fn(async () => {
    this.notify('验证码已发送，请检查邮箱', 'success');
    this.changed();
  });
  verify = vi.fn(async () => {
    this.user = { id: 'alice', email: 'alice@example.test', verified: true };
    this.changed();
  });
  notify(message: string, tone = 'info') {
    this.message = message;
    this.messageTone = tone;
  }
  changed() {
    this.dispatchEvent(new Event('change'));
  }
}
function setup(fake = new FakeSession()) {
  const host = document.createElement('div');
  document.body.append(host);
  const signedIn = vi.fn();
  const dispose = mountLogin(host, {
    session: fake as unknown as AuthSession,
    signedIn,
    brand: () => '工作台'
  });
  const button = (name: string) => [...host.querySelectorAll('button')].find(node => node.textContent === name)!;
  const field = (label: string) => host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
  return { host, fake, signedIn, dispose, button, field };
}

describe('全局登录页', () => {
  it('应用名作为页面标题，下面是邮箱验证码登录卡片；打开时建立会话', async () => {
    const { host, fake } = setup();
    expect(host.querySelector('h1')?.textContent).toBe('工作台');
    expect(host.querySelector('h2')?.textContent).toBe('邮箱验证码登录');
    await vi.waitFor(() => expect(fake.initialize).toHaveBeenCalledTimes(1));
  });
  it('发送验证码后提示出现在卡片里，重绘保留已输入的邮箱；登录成功后交给应用跳转（只跳一次）', async () => {
    const { host, fake, signedIn, button, field } = setup();
    field('邮箱').value = 'alice@example.test';
    field('邮箱').dispatchEvent(new window.Event('input') as unknown as Event);
    button('发送验证码').click();
    await vi.waitFor(() => expect(host.textContent).toContain('验证码已发送，请检查邮箱'));
    expect(fake.sendCode).toHaveBeenCalledWith('alice@example.test');
    expect(field('邮箱').value).toBe('alice@example.test');
    field('验证码').value = '123456';
    button('登录').click();
    await vi.waitFor(() => expect(signedIn).toHaveBeenCalledTimes(1));
    expect(fake.verify).toHaveBeenCalledWith('alice@example.test', '123456');
    fake.changed();
    await Promise.resolve();
    expect(signedIn).toHaveBeenCalledTimes(1);
  });
  it('打开时已经登录：直接交给应用跳转', async () => {
    const fake = new FakeSession();
    fake.user = { id: 'alice', email: 'alice@example.test', verified: true };
    const { signedIn } = setup(fake);
    await vi.waitFor(() => expect(signedIn).toHaveBeenCalledTimes(1));
  });
  it('会话建不起来（例如读不到公开配置）时原因显示在卡片里', async () => {
    const fake = new FakeSession();
    fake.initialize.mockRejectedValueOnce(new Error('团队协作服务尚未配置或响应格式不正确'));
    const { host } = setup(fake);
    await vi.waitFor(() => expect(host.textContent).toContain('团队协作服务尚未配置或响应格式不正确'));
  });
  it('卸载后不再随会话重绘并清空容器', () => {
    const { host, fake, dispose } = setup();
    dispose();
    fake.notify('验证码已发送，请检查邮箱');
    fake.changed();
    expect(host.childElementCount).toBe(0);
  });
});
