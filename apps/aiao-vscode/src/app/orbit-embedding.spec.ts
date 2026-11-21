import type { OrbitClient } from '@aiao/orbit/client';
import type { Provider } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { ORBIT_CLIENT, bootstrapWithOrbit } from './orbit-embedding';

type Bootstrap = (providers: Provider[]) => Promise<unknown>;

describe('作为集成应用嵌入 Aiao Desktop（US-410）', () => {
  it('不在桌面里（直接访问）：不握手，照常启动，注入的客户端为空', async () => {
    const bootstrap = vi.fn<Bootstrap>(async () => undefined);
    await bootstrapWithOrbit(bootstrap);
    expect(bootstrap).toHaveBeenCalledOnce();
    expect(bootstrap.mock.calls[0][0]).toEqual([{ provide: ORBIT_CLIENT, useValue: undefined }]);
  });

  it('在桌面里：握手完成后才启动 Angular，客户端经 ORBIT_CLIENT 注入', async () => {
    const order: string[] = [];
    const client = { ready: vi.fn() } as unknown as OrbitClient;
    const connect = vi.fn(async () => {
      order.push('connect');
      return client;
    });
    const bootstrap = vi.fn<Bootstrap>(async () => {
      order.push('bootstrap');
    });
    await bootstrapWithOrbit(bootstrap, connect);
    expect(order).toEqual(['connect', 'bootstrap']);
    expect(bootstrap.mock.calls[0][0]).toEqual([{ provide: ORBIT_CLIENT, useValue: client }]);
  });

  it('握手失败时不启动，把错误交给调用方', async () => {
    const bootstrap = vi.fn<Bootstrap>(async () => undefined);
    await expect(bootstrapWithOrbit(bootstrap, () => Promise.reject(new Error('连接桌面宿主超时')))).rejects.toThrow(
      '连接桌面宿主超时'
    );
    expect(bootstrap).not.toHaveBeenCalled();
  });
});
