import { describe, expect, it, vi } from 'vitest';
import { switchIdentity, type IdentitySwitchSteps } from './identity-switch';

function createSteps(overrides: Partial<IdentitySwitchSteps> = {}) {
  const calls: string[] = [];
  const steps: IdentitySwitchSteps = {
    remoteConnected: vi.fn(async () => {
      calls.push('remoteConnected');
      return true;
    }),
    disconnectRemote: vi.fn(async () => {
      calls.push('disconnectRemote');
    }),
    connectRemote: vi.fn(async () => {
      calls.push('connectRemote');
    }),
    signIn: vi.fn(async () => {
      calls.push('signIn');
    }),
    reload: vi.fn(() => {
      calls.push('reload');
    }),
    ...overrides
  };
  return { calls, steps };
}

describe('switchIdentity', () => {
  // 登录事件会让还连着的适配器按新身份重建实时订阅，重建发出的请求随即被重新加载打断，
  // 控制台留一条「Failed to resolve caller buckets … Failed to fetch」：先断开就没有这一轮
  it('先断开远端，再登录或退出，最后重新加载', async () => {
    const { calls, steps } = createSteps();

    await switchIdentity(steps);

    expect(calls).toEqual(['remoteConnected', 'disconnectRemote', 'signIn', 'reload']);
  });

  it('登录失败：把原先连着的远端连回去，错误原样抛出，不重新加载', async () => {
    const failure = new Error('invalid credentials');
    const { calls, steps } = createSteps({
      signIn: vi.fn(async () => {
        throw failure;
      })
    });

    await expect(switchIdentity(steps)).rejects.toBe(failure);

    expect(calls).toEqual(['remoteConnected', 'disconnectRemote', 'connectRemote']);
  });

  it('登录失败而远端原本就没连：不替页面连上', async () => {
    const { steps } = createSteps({
      remoteConnected: vi.fn(async () => false),
      signIn: vi.fn(async () => {
        throw new Error('offline');
      })
    });

    await expect(switchIdentity(steps)).rejects.toThrow('offline');

    expect(steps.connectRemote).not.toHaveBeenCalled();
  });
});
