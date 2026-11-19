import type { SupabaseClient } from '@supabase/supabase-js';
import { Window } from 'happy-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Perform } from './elements.js';
import { loginView, type LoginDraft, type LoginViewController } from './login-view.js';

let window: Window;
beforeEach(() => {
  window = new Window();
  vi.stubGlobal('document', window.document);
  vi.stubGlobal('KeyboardEvent', window.KeyboardEvent);
});
afterEach(() => {
  vi.unstubAllGlobals();
});
/** 认证客户端只当作「已就绪」的记号，登录视图不直接调用它。 */
const client = {} as unknown as SupabaseClient;
function setup(
  options: { online?: boolean; ready?: boolean; message?: string; invited?: boolean } = {},
  draft: LoginDraft = { email: '', token: '' }
) {
  const controller: LoginViewController = {
    online: options.online ?? true,
    ...(options.ready !== false && { auth: client }),
    message: options.message ?? '',
    messageTone: 'error',
    sendCode: vi.fn(async () => undefined),
    verify: vi.fn(async () => undefined)
  };
  const perform: Perform = async work => {
    await work();
  };
  const dismiss = vi.fn();
  const view = loginView(controller, perform, draft, { invited: options.invited, dismiss });
  const button = (name: string) => [...view.querySelectorAll('button')].find(node => node.textContent === name)!;
  const field = (label: string) =>
    [...view.querySelectorAll('label')].find(node => node.textContent?.startsWith(label))!.querySelector('input')!;
  return { controller, view, button, field, draft, dismiss };
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
  it('邮箱里回车发送验证码，验证码里回车登录', async () => {
    const { controller, field } = setup();
    field('邮箱').value = 'alice@example.test';
    field('邮箱').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter' }) as unknown as Event);
    await vi.waitFor(() => expect(controller.sendCode).toHaveBeenCalledWith('alice@example.test'));
    field('验证码').value = '123456';
    field('验证码').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter' }) as unknown as Event);
    await vi.waitFor(() => expect(controller.verify).toHaveBeenCalledWith('alice@example.test', '123456'));
  });
  it('登录相关的提示显示在卡片里，可以关闭；带邀请链接打开时提示用受邀邮箱登录', () => {
    const { view, dismiss } = setup({ message: '验证码已过期或无效，请重新获取', invited: true });
    const notes = [...view.querySelectorAll('[role="status"]')].map(node => node.textContent);
    expect(notes).toEqual(['已识别邀请链接：用受邀邮箱登录后即可接受邀请', '验证码已过期或无效，请重新获取']);
    view.querySelector<HTMLButtonElement>('button[aria-label="关闭提示"]')!.click();
    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(setup().view.querySelector('[role="status"]')).toBeNull();
  });
  it('按钮不可用时说明原因：认证服务还没连上，或离线', () => {
    expect(setup({ ready: false }).view.textContent).toContain('正在连接认证服务…');
    expect(setup({ online: false }).view.textContent).toContain('离线时无法登录，联网后再试');
  });
  it('全站都要登录：没有匿名工作台入口，说明登录不会上传本机数据', () => {
    const { view } = setup();
    expect(view.querySelector('a')).toBeNull();
    expect(view.textContent).toContain('登录不会上传本机数据。团队草稿在会话确认前保持锁定。');
  });
});
