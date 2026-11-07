import { describe, expect, it, vi } from 'vitest';
import { AppNavigation } from './navigation.js';

describe('DESKTOP-US-305/501 每实例独立导航', () => {
  it('前进后退只处理当前实例；新导航丢弃当前实例的前进分支', async () => {
    const one = new AppNavigation('/one?x=1#a', vi.fn());
    const two = new AppNavigation('/two?x=2#b', vi.fn());
    const apply = vi.fn(async (_route: string, _signal: AbortSignal) => undefined);
    one.bind(apply);
    two.bind(vi.fn());
    one.record('/one?x=3#c');
    await one.go({ type: 'back' }, new AbortController().signal);
    expect(one.state).toEqual({ route: '/one?x=1#a', back: false, forward: true });
    expect(two.state).toEqual({ route: '/two?x=2#b', back: false, forward: false });
    await one.go({ type: 'forward' }, new AbortController().signal);
    expect(apply.mock.calls.map(([route]) => route)).toEqual(['/one?x=1#a', '/one?x=3#c']);
    await one.go({ type: 'back' }, new AbortController().signal);
    await one.go({ type: 'push', route: '/new' }, new AbortController().signal);
    expect(one.state).toEqual({ route: '/new', back: true, forward: false });
  });
  it('失败、取消与未绑定协议不提交路由或改变历史', async () => {
    const changed = vi.fn();
    const navigation = new AppNavigation('/old', changed);
    await expect(navigation.go({ type: 'push', route: '/new' }, new AbortController().signal)).rejects.toThrow(
      'UNSUPPORTED'
    );
    const off = navigation.bind(async () => {
      throw new Error('DIRTY');
    });
    await expect(navigation.go({ type: 'push', route: '/new' }, new AbortController().signal)).rejects.toThrow('DIRTY');
    expect(navigation.state).toEqual({ route: '/old', back: false, forward: false });
    off();
    const abort = new AbortController();
    navigation.bind(async () => {
      abort.abort(new Error('CANCELLED'));
    });
    await expect(navigation.go({ type: 'push', route: '/new' }, abort.signal)).rejects.toThrow('CANCELLED');
    expect(navigation.state.route).toBe('/old');
  });
  it('replace 不新增历史，未完成导航拒绝并发，释放后允许重新绑定', async () => {
    const navigation = new AppNavigation('/', vi.fn());
    let finish: () => void = () => undefined;
    const off = navigation.bind(
      () =>
        new Promise<void>(resolve => {
          finish = resolve;
        })
    );
    const pending = navigation.go({ type: 'push', route: '/next' }, new AbortController().signal);
    await expect(navigation.go({ type: 'push', route: '/another' }, new AbortController().signal)).rejects.toThrow(
      'BUSY'
    );
    finish();
    await pending;
    navigation.record('/next?q=changed#anchor', true);
    expect(navigation.state).toEqual({ route: '/next?q=changed#anchor', back: true, forward: false });
    off();
    navigation.bind(vi.fn());
    await navigation.go({ type: 'back' }, new AbortController().signal);
    expect(navigation.state.route).toBe('/');
  });
});
