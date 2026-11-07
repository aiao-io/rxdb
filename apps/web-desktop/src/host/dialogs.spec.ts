import { describe, expect, it } from 'vitest';
import { Dialogs } from './dialogs.js';

const options = { title: '请求', message: '', actions: [{ id: 'yes', label: '确认' }] };
describe('DESKTOP-US-104/401 宿主模态生命周期', () => {
  it('当前请求取消后显示下一个，取消排队请求不影响当前请求', async () => {
    const dialogs = new Dialogs(() => undefined);
    const first = new AbortController();
    const second = new AbortController();
    const one = dialogs.ask(options, first.signal);
    const two = dialogs.ask({ ...options, title: '第二个' }, second.signal);
    const three = dialogs.ask({ ...options, title: '第三个' });
    second.abort();
    expect(await two).toEqual({ action: 'cancel', values: {} });
    expect(dialogs.current?.options.title).toBe('请求');
    first.abort();
    expect(await one).toEqual({ action: 'cancel', values: {} });
    expect(dialogs.current?.options.title).toBe('第三个');
    dialogs.answer('yes', { name: '值' });
    expect(await three).toEqual({ action: 'yes', values: { name: '值' } });
    expect(dialogs.current).toBeNull();
  });
  it('已取消请求不入队，销毁清空全部待定请求', async () => {
    const dialogs = new Dialogs(() => undefined);
    const controller = new AbortController();
    controller.abort();
    expect((await dialogs.ask(options, controller.signal)).action).toBe('cancel');
    expect(dialogs.current).toBeNull();
    const pending = [dialogs.ask(options), dialogs.ask(options)];
    dialogs.cancelAll();
    expect((await Promise.all(pending)).every(value => value.action === 'cancel')).toBe(true);
  });
});
