import { describe, expect, it } from 'vitest';
import { createOrbit } from '../index.js';

describe('服务端安全导入', () => {
  it('创建与销毁不依赖浏览器全局对象', () => {
    const runtime = createOrbit();
    expect(runtime.instances).toEqual([]);
    runtime.dispose();
    runtime.dispose();
  });
});

describe('应用登记与失败边界', () => {
  const options = { appId: 'editor', instanceId: 'window-1', version: '1', url: 'https://apps.example/editor' };
  it('同一应用可以多开，但不能占用相同实例身份；销毁后释放身份', () => {
    const runtime = createOrbit({ allowedOrigins: ['https://apps.example'] });
    const first = runtime.createApp(options);
    runtime.createApp({ ...options, instanceId: 'window-2' });
    expect(() => runtime.createApp(options)).toThrow(expect.objectContaining({ code: 'DUPLICATE_INSTANCE' }));
    expect(runtime.instances).toHaveLength(2);
    first.destroy();
    runtime.createApp(options);
    first.destroy();
    expect(runtime.instances).toHaveLength(2);
    runtime.dispose();
    expect(runtime.instances).toEqual([]);
    expect(() => runtime.createApp(options)).toThrow();
    expect(() => runtime.bus.$emit('x')).toThrow();
  });
  it('精确来源、入口、身份与超时校验', () => {
    for (const origin of ['bad', 'file:///a', 'https://apps.example/path', 'https://apps.example/'])
      expect(() => createOrbit({ allowedOrigins: [origin] })).toThrow();
    const runtime = createOrbit({ allowedOrigins: ['https://apps.example'] });
    for (const url of [
      'bad',
      'javascript:alert(1)',
      'file:///a',
      'https://user:pass@apps.example/',
      'https://apps.example/?__aiao_orbit=x'
    ])
      expect(() => runtime.createApp({ ...options, url })).toThrow();
    expect(() => runtime.createApp({ ...options, url: 'https://evil.example/' })).toThrow(
      expect.objectContaining({ code: 'FORBIDDEN_ORIGIN' })
    );
    for (const name of ['', ' ', 'a'.repeat(129)])
      expect(() => runtime.createApp({ ...options, appId: name })).toThrow();
    for (const timeout of [0, -1, NaN, Infinity, 120001])
      expect(() => runtime.createApp({ ...options, timeout })).toThrow();
    const controller = new AbortController();
    controller.abort();
    expect(() => runtime.createApp({ ...options, signal: controller.signal })).toThrow(
      expect.objectContaining({ code: 'ABORTED' })
    );
    runtime.dispose();
  });
});
