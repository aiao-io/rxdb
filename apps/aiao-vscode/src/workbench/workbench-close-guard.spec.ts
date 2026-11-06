// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installWorkbenchCloseGuard, type WorkbenchCloseGuard } from './workbench-close-guard.js';

const guards: WorkbenchCloseGuard[] = [];
const install = (): WorkbenchCloseGuard => {
  const guard = installWorkbenchCloseGuard(window);
  guards.push(guard);
  return guard;
};
const key = (type: 'keydown' | 'keyup', init: KeyboardEventInit): KeyboardEvent =>
  new KeyboardEvent(type, { bubbles: true, cancelable: true, ...init });
/** 触发一次页面卸载前事件，返回浏览器是否会弹出「离开此网站？」。 */
const unload = (): boolean => {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
};

afterEach(() => {
  guards.splice(0).forEach(guard => guard.dispose());
  vi.restoreAllMocks();
});

describe('键盘触发的关闭确认（对齐 VS Code 网页版 window.confirmBeforeClose = keyboardOnly）', () => {
  it('没有按键时关闭页面（点标签页 ×）不确认', () => {
    install();
    expect(unload()).toBe(false);
  });

  it('⌘ / Ctrl 按下期间关闭页面会弹出浏览器的离开确认：Chrome 吞掉随后的 W，页面只收到修饰键按下', () => {
    install();
    window.dispatchEvent(key('keydown', { key: 'Meta', metaKey: true }));
    expect(unload()).toBe(true);
    window.dispatchEvent(key('keyup', { key: 'Meta', metaKey: false }));
    window.dispatchEvent(key('keydown', { key: 'Control', ctrlKey: true }));
    expect(unload()).toBe(true);
  });

  it('确认时同时设置 returnValue，兼容要求该字段的浏览器', () => {
    install();
    window.dispatchEvent(key('keydown', { key: 'Meta', metaKey: true }));
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect((event as BeforeUnloadEvent).returnValue).toBe('');
  });

  it('Alt 与 Shift 同样算键盘触发，与 VS Code 的修饰键集合一致', () => {
    install();
    window.dispatchEvent(key('keydown', { key: 'Alt', altKey: true }));
    expect(unload()).toBe(true);
    window.dispatchEvent(key('keyup', { key: 'Alt' }));
    window.dispatchEvent(key('keydown', { key: 'Shift', shiftKey: true }));
    expect(unload()).toBe(true);
  });

  it('修饰键松开后恢复为不确认', () => {
    install();
    window.dispatchEvent(key('keydown', { key: 'Meta', metaKey: true }));
    window.dispatchEvent(key('keyup', { key: 'Meta' }));
    expect(unload()).toBe(false);
  });

  it('窗口失焦清除修饰键状态：⌘Tab 切走后松开的按键收不到，不能让之后鼠标关页被误拦', () => {
    install();
    window.dispatchEvent(key('keydown', { key: 'Meta', metaKey: true }));
    window.dispatchEvent(new Event('blur'));
    expect(unload()).toBe(false);
  });

  it('已被默认处理的按键事件不计入，与 VS Code 一致', () => {
    install();
    const handled = key('keydown', { key: 'Meta', metaKey: true });
    handled.preventDefault();
    window.dispatchEvent(handled);
    expect(unload()).toBe(false);
  });

  it('PWA 独立窗口不弹：⌘W 在那里由工作台自己拦截并关闭标签', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      query => ({ matches: query === '(display-mode: standalone)' }) as MediaQueryList
    );
    install();
    window.dispatchEvent(key('keydown', { key: 'Meta', metaKey: true }));
    expect(unload()).toBe(false);
  });

  it('预览 iframe 拿不到宿主键盘事件，经上报的修饰键状态同样触发确认', () => {
    const guard = install();
    guard.setPreviewModifier(true);
    expect(unload()).toBe(true);
    guard.setPreviewModifier(false);
    expect(unload()).toBe(false);
  });

  it('宿主与预览任一方按着修饰键就确认，两方都松开才解除', () => {
    const guard = install();
    guard.setPreviewModifier(true);
    window.dispatchEvent(key('keydown', { key: 'Meta', metaKey: true }));
    guard.setPreviewModifier(false);
    expect(unload()).toBe(true);
    window.dispatchEvent(key('keyup', { key: 'Meta' }));
    expect(unload()).toBe(false);
  });

  it('释放后不再拦截也不再监听', () => {
    const guard = install();
    window.dispatchEvent(key('keydown', { key: 'Meta', metaKey: true }));
    guard.dispose();
    expect(unload()).toBe(false);
    window.dispatchEvent(key('keydown', { key: 'Meta', metaKey: true }));
    expect(unload()).toBe(false);
  });
});
