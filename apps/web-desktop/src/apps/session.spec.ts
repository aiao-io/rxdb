import type { OrbitClient, OrbitValue } from '@aiao/orbit';
import { describe, expect, it, vi } from 'vitest';
import { defaultProfile } from '../core/state.js';
import { AppSession } from './session.js';

function fixture() {
  const handlers = new Map<string, Parameters<OrbitClient['onRequest']>[1]>();
  const events = new Map<string, Set<(value: unknown) => void>>();
  const disposers: (() => void)[] = [];
  const request = vi.fn<(method: string, payload: unknown) => Promise<unknown>>(async () => ({
    type: 'inline',
    value: true
  }));
  const client = {
    context: { appId: 'editor', version: '1.0.0', props: { profile: defaultProfile('windows'), route: '' } },
    request,
    onRequest: (name: string, handler: Parameters<OrbitClient['onRequest']>[1]) => {
      handlers.set(name, handler);
      return () => handlers.delete(name);
    },
    onDispose: (handler: () => void) => disposers.push(handler),
    bus: {
      $on: (name: string, handler: (value: unknown) => void) => {
        if (!events.has(name)) events.set(name, new Set());
        events.get(name)!.add(handler);
      },
      $off: (name: string, handler: (value: unknown) => void) => events.get(name)?.delete(handler)
    }
  } as unknown as OrbitClient;
  const session = new AppSession(client);
  const invoke = async (name: string, payload: OrbitValue = null) => {
    const handler = handlers.get(name);
    if (!handler) throw new Error('缺少协议处理器');
    return handler(payload, new AbortController().signal);
  };
  return { session, request, invoke, events, dispose: () => disposers.forEach(dispose => dispose()) };
}

describe('DESKTOP-US-307 应用协作挂起', () => {
  it('挂起期间不执行事件处理与业务请求，恢复只处理最新状态', async () => {
    const { session, invoke, events } = fixture();
    session.bindSuspension(() => true);
    const changed = vi.fn();
    session.onEvent('files.changed', changed);
    await expect(invoke('application.suspend')).resolves.toEqual({ saved: true });
    for (const handler of events.get('files.changed')!) {
      handler('旧');
      handler('新');
    }
    for (const handler of events.get('desktop.changed')!) handler({ ...defaultProfile('windows'), scale: 150 });
    expect(changed).not.toHaveBeenCalled();
    expect(session.profile.scale).toBe(100);
    await expect(session.request('files.list')).rejects.toThrow('SUSPENDED');
    await expect(invoke('application.resume')).resolves.toBe(true);
    expect(changed).toHaveBeenCalledExactlyOnceWith('新');
    expect(session.profile.scale).toBe(150);
  });
  it('未登记协议、脏状态及进行中的业务请求均拒绝挂起', async () => {
    const { session, invoke, request } = fixture();
    await expect(invoke('application.suspend')).rejects.toThrow('UNSUPPORTED');
    const off = session.bindSuspension(() => false);
    await expect(invoke('application.suspend')).rejects.toThrow('DIRTY');
    off();
    session.bindSuspension(() => true);
    let complete: (value: unknown) => void = () => undefined;
    request.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          complete = resolve;
        })
    );
    const pending = session.request('storage.set', { key: 'a' });
    await expect(invoke('application.suspend')).rejects.toThrow('BUSY');
    complete({ type: 'inline', value: true });
    await pending;
    await expect(invoke('application.suspend')).resolves.toEqual({ saved: true });
  });
  it('事件解绑和实例销毁释放挂起事件，不再发送业务请求', async () => {
    const { session, invoke, events, dispose, request } = fixture();
    session.bindSuspension(() => true);
    const changed = vi.fn();
    const off = session.onEvent('files.changed', changed);
    await invoke('application.suspend');
    for (const handler of events.get('files.changed')!) handler('旧');
    off();
    await invoke('application.resume');
    expect(changed).not.toHaveBeenCalled();
    dispose();
    await expect(session.request('files.list')).rejects.toThrow('CANCELLED');
    expect([...events.values()].every(handlers => handlers.size === 0)).toBe(true);
    expect(request).not.toHaveBeenCalled();
  });
});

describe('DESKTOP-US-305 导航与宿主同步', () => {
  it('应用记录完整位置，宿主导航只调用已登记处理器并回传当前状态', async () => {
    const { session, invoke, request } = fixture();
    const apply = vi.fn();
    session.navigation.bind(apply);
    session.navigation.record('/documents/one?line=2#L2');
    await vi.waitFor(() =>
      expect(
        request.mock.calls.some(
          ([method, payload]) => method === 'window.update' && JSON.stringify(payload).includes('line=2#L2')
        )
      ).toBe(true)
    );
    await expect(invoke('navigation.navigate', { type: 'back' })).resolves.toEqual({
      route: '/',
      back: false,
      forward: true
    });
    expect(apply).toHaveBeenCalledWith('/', expect.any(AbortSignal));
    await expect(invoke('navigation.navigate', { type: 'push', route: '/?token=secret' })).rejects.toThrow('凭据');
    expect(session.navigation.state.route).toBe('/');
  });
  it('保存位置失败有明确错误，新位置可重新提交；挂起后拒绝导航', async () => {
    const { session, invoke, request } = fixture();
    request.mockRejectedValueOnce(new Error('QUOTA: 无法保存桌面位置'));
    session.navigation.bind(vi.fn());
    await vi.waitFor(() => expect(session.navigationError).toContain('QUOTA'));
    session.navigation.record('/next');
    await vi.waitFor(() => expect(session.navigationError).toBe(''));
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    session.bindSuspension(() => true);
    await vi.waitFor(async () => {
      await expect(invoke('application.suspend')).resolves.toEqual({ saved: true });
    });
    await expect(invoke('navigation.navigate', { type: 'push', route: '/another' })).rejects.toThrow('SUSPENDED');
    expect(session.navigation.state.route).toBe('/next');
  });
});

describe('DESKTOP-US-305/307 导航期间的后台状态', () => {
  it('导航尚未完成时不能挂起应用', async () => {
    const { session, invoke, request } = fixture();
    let finish: () => void = () => undefined;
    session.navigation.bind(
      () =>
        new Promise<void>(resolve => {
          finish = resolve;
        })
    );
    session.bindSuspension(() => true);
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    await vi.waitFor(async () => {
      await expect(invoke('application.suspend')).resolves.toEqual({ saved: true });
    });
    await invoke('application.resume');
    const pending = invoke('navigation.navigate', { type: 'push', route: '/next' });
    const rejected = expect(invoke('application.suspend')).rejects.toThrow('BUSY');
    finish();
    await pending;
    await rejected;
  });
});
