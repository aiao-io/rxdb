import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearTraffic,
  installTrafficRecorder,
  lastTransportStatus,
  trafficEntries,
  type FetchScope
} from './traffic-recorder';

/** 一个只认 `/v1/` 的假宿主，`fetch` 由每条用例自己摆。 */
const scopeWith = (fetchImpl: typeof fetch): FetchScope => ({ fetch: fetchImpl });

const okFetch = ((): Promise<Response> =>
  Promise.resolve(new Response(null, { status: 200 }))) as unknown as typeof fetch;
const deadFetch = ((): Promise<Response> =>
  Promise.reject(new TypeError('Failed to fetch'))) as unknown as typeof fetch;

describe('traffic-recorder', () => {
  beforeEach(() => {
    clearTraffic();
  });

  it('记录成功请求的状态码', async () => {
    const scope = scopeWith(okFetch);
    const uninstall = installTrafficRecorder(scope);

    await scope.fetch('http://api.test/v1/recipes');

    expect(trafficEntries().at(-1)?.status).toBe(200);
    uninstall();
  });

  it('传输失败记 status 0 并把异常原样抛出', async () => {
    const scope = scopeWith(deadFetch);
    const uninstall = installTrafficRecorder(scope);

    await expect(scope.fetch('http://api.test/v1/recipes')).rejects.toThrow(TypeError);

    expect(trafficEntries().at(-1)?.status).toBe(0);
    uninstall();
  });

  /**
   * 「连不连得上后端」是客观状态，清空面板是纯显示动作。两者共用一个缓冲区的话，
   * 离线时点一下「清空日志」离线横幅就消失了 —— 面板声称恢复了，而下一次请求照样打不通。
   */
  it('清空面板不改写最近一次协议请求的状态码', async () => {
    const scope = scopeWith(deadFetch);
    const uninstall = installTrafficRecorder(scope);

    await expect(scope.fetch('http://api.test/v1/recipes')).rejects.toThrow(TypeError);
    expect(lastTransportStatus()).toBe(0);

    clearTraffic();

    expect(trafficEntries()).toEqual([]);
    expect(lastTransportStatus()).toBe(0);
    uninstall();
  });

  it('不记 __control 的请求', async () => {
    const spy = vi.fn(okFetch);
    const scope = scopeWith(spy as unknown as typeof fetch);
    const uninstall = installTrafficRecorder(scope);

    await scope.fetch('http://api.test/__control/state');

    expect(trafficEntries()).toEqual([]);
    expect(spy).toHaveBeenCalledTimes(1);
    uninstall();
  });
});
