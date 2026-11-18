import type { SupabaseClient } from '@supabase/supabase-js';
import { Window } from 'happy-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Perform } from './elements.js';
import { loginView, type LoginDraft, type LoginViewController } from './login-view.js';

let window: Window;
beforeEach(() => {
  window = new Window();
  vi.stubGlobal('document', window.document);
});
afterEach(() => {
  vi.unstubAllGlobals();
});
/** 认证客户端只当作「已就绪」的记号，登录视图不直接调用它。 */
const client = {} as unknown as SupabaseClient;
function setup(options: { online?: boolean; ready?: boolean } = {}, draft: LoginDraft = { email: '', token: '' }) {
  const controller: LoginViewController = {
    online: options.online ?? true,
    ...(options.ready !== false && { auth: client }),
    sendCode: vi.fn(async () => undefined),
    verify: vi.fn(async () => undefined)
  };
  const perform: Perform = async work => {
    await work();
  };
  const view = loginView(controller, perform, draft);
  const button = (name: string) => [...view.querySelectorAll('button')].find(node => node.textContent === name)!;
  const field = (label: string) =>
    [...view.querySelectorAll('label')].find(node => node.textContent?.startsWith(label))!.querySelector('input')!;
  return { controller, view, button, field, draft };
}

describe('邮箱验证码登录', () => {
  it('公开配置还没取到（认证客户端未建好）时发送验证码与登录都不可用：点了也只会报认证未配置', () => {
    const { button } = setup({ ready: false });
    expect(button('发送验证码').disabled).toBe(true);
    expect(button('登录').disabled).toBe(true);
  });
  it('离线时发送验证码与登录都不可用', () => {
    const { button } = setup({ online: false });
    expect(button('发送验证码').disabled).toBe(true);
    expect(button('登录').disabled).toBe(true);
  });
  it('在线且认证客户端就绪：按输入的邮箱发送验证码，按邮箱与验证码登录', async () => {
    const { controller, button, field } = setup();
    field('邮箱').value = 'alice@example.test';
    field('验证码').value = '123456';
    button('发送验证码').click();
    await vi.waitFor(() => expect(controller.sendCode).toHaveBeenCalledWith('alice@example.test'));
    button('登录').click();
    await vi.waitFor(() => expect(controller.verify).toHaveBeenCalledWith('alice@example.test', '123456'));
  });
  it('输入随时记进暂存，重绘时从暂存恢复', () => {
    const { field, draft } = setup();
    field('邮箱').value = 'bob@example.test';
    field('邮箱').dispatchEvent(new window.Event('input') as unknown as Event);
    field('验证码').value = '654321';
    field('验证码').dispatchEvent(new window.Event('input') as unknown as Event);
    expect(draft).toEqual({ email: 'bob@example.test', token: '654321' });
    const again = setup({}, draft);
    expect(again.field('邮箱').value).toBe('bob@example.test');
    expect(again.field('验证码').value).toBe('654321');
  });
});
