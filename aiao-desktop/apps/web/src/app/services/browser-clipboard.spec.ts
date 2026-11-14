import { describe, expect, it, vi } from 'vitest';

import { browserClipboard } from './browser-clipboard';

/** 假的 `navigator`：剪贴板与用户激活状态都由测试控制。 */
function fakeNavigator(options: { clipboard?: Partial<Clipboard>; active?: boolean | 'missing' } = {}): Navigator {
  const { clipboard, active = false } = options;
  return {
    ...(clipboard ? { clipboard } : {}),
    ...(active === 'missing' ? {} : { userActivation: { isActive: active, hasBeenActive: active } })
  } as unknown as Navigator;
}

describe('browserClipboard', () => {
  it('读写经浏览器的异步剪贴板，文本原样往返', async () => {
    const readText = vi.fn(async () => 'from the clipboard');
    const writeText = vi.fn(async () => undefined);
    const clipboard = browserClipboard(fakeNavigator({ clipboard: { readText, writeText } }));
    expect(await clipboard.readText()).toBe('from the clipboard');
    await clipboard.writeText('to the clipboard');
    expect(writeText).toHaveBeenCalledExactlyOnceWith('to the clipboard');
  });

  it('浏览器自己的拒绝原样抛出，不吞也不兜底：权限提示被拒、文档没有焦点都是它的 NotAllowedError', async () => {
    const denied = new DOMException('Read permission denied.', 'NotAllowedError');
    const clipboard = browserClipboard(
      fakeNavigator({
        clipboard: { readText: () => Promise.reject(denied), writeText: () => Promise.reject(denied) }
      })
    );
    await expect(clipboard.readText()).rejects.toBe(denied);
    await expect(clipboard.writeText('x')).rejects.toBe(denied);
  });

  it('浏览器没有提供异步剪贴板（非安全上下文）：读写都按浏览器拒绝处理（NotAllowedError），不退回旧接口', async () => {
    const clipboard = browserClipboard(fakeNavigator());
    await expect(clipboard.readText()).rejects.toMatchObject({ name: 'NotAllowedError' });
    await expect(clipboard.writeText('x')).rejects.toMatchObject({ name: 'NotAllowedError' });
  });

  it('用户手势看宿主页面的 navigator.userActivation.isActive；没有这个接口就当作没有手势', () => {
    expect(browserClipboard(fakeNavigator({ active: true })).userActive()).toBe(true);
    expect(browserClipboard(fakeNavigator({ active: false })).userActive()).toBe(false);
    expect(browserClipboard(fakeNavigator({ active: 'missing' })).userActive()).toBe(false);
  });

  it('默认用当前环境的 navigator', () => {
    vi.stubGlobal('navigator', fakeNavigator({ active: true }));
    expect(browserClipboard().userActive()).toBe(true);
  });
});
