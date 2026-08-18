import { DESKTOP_HOST_TRANSPORT_KEY } from '@aiao/rxdb-adapter-electron';
import { isDesktopHostRuntime } from './desktop-environment';

describe('isDesktopHostRuntime', () => {
  it('preload 注入过桥接时为 true', () => {
    expect(isDesktopHostRuntime({ [DESKTOP_HOST_TRANSPORT_KEY]: { request: () => undefined, subscribe: () => undefined } })).toBe(
      true
    );
  });

  it('浏览器预览（没有那把钥匙）时为 false', () => {
    expect(isDesktopHostRuntime({})).toBe(false);
  });

  it('探的是 RxDB 的桥接，不是 demo 自己的 window.electron', () => {
    expect(isDesktopHostRuntime({ electron: { ping: () => undefined } })).toBe(false);
  });

  it('非对象一律为 false，不抛错', () => {
    expect(isDesktopHostRuntime(undefined)).toBe(false);
    expect(isDesktopHostRuntime(null)).toBe(false);
    expect(isDesktopHostRuntime('window')).toBe(false);
  });
});
