import { describe, expect, it, vi } from 'vitest';
import { Suspension } from './suspension.js';

function fixture(dirty = false, supported = true) {
  const request = vi.fn<(name: string) => Promise<unknown>>(async name =>
    name === 'document.prepareClose' ? { dirty }
    : name === 'application.suspend' ? { saved: true }
    : true
  );
  const state = { value: 'running' };
  const suspension = new Suspension(supported, request, value => {
    state.value = value;
  });
  return { request, state, suspension };
}

describe('DESKTOP-US-307 明确挂起与恢复', () => {
  it('确认无脏内容且应用确认已保存后才挂起，恢复等待应用确认', async () => {
    const { request, state, suspension } = fixture();
    await suspension.suspend();
    expect(state.value).toBe('suspended');
    expect(request.mock.calls.map(([name]) => name)).toEqual(['document.prepareClose', 'application.suspend']);
    await suspension.resume();
    expect(state.value).toBe('running');
    expect(request.mock.calls.at(-1)).toEqual(['application.resume']);
  });
  it('脏文档或未声明协议的应用不能挂起，也不会发送挂起请求', async () => {
    for (const [dirty, supported, code] of [
      [true, true, 'DIRTY'],
      [false, false, 'UNSUPPORTED']
    ] as const) {
      const { request, state, suspension } = fixture(dirty, supported);
      await expect(suspension.suspend()).rejects.toThrow(code);
      expect(state.value).toBe('running');
      expect(request.mock.calls.some(([name]) => name === 'application.suspend')).toBe(false);
    }
  });
  it('无效保存确认不能宣称挂起；恢复失败保留未确认状态供重试', async () => {
    const { request, state, suspension } = fixture();
    request.mockImplementation(async name => (name === 'document.prepareClose' ? { dirty: false } : false));
    await expect(suspension.suspend()).rejects.toThrow('INVALID');
    expect(state.value).toBe('unknown');
    request.mockResolvedValue(true);
    await suspension.resume();
    expect(state.value).toBe('running');
  });
  it('挂起和恢复期间拒绝重复操作，隐藏本身不改变挂起状态', async () => {
    const { request, state, suspension } = fixture();
    let complete: (value: unknown) => void = () => undefined;
    request.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          complete = resolve;
        })
    );
    const pending = suspension.suspend();
    await expect(suspension.suspend()).rejects.toThrow('BUSY');
    expect(state.value).toBe('suspending');
    complete({ dirty: false });
    await pending;
    expect(state.value).toBe('suspended');
  });
});
