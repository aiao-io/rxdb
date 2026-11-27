// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { attachWorkbenchLongPress } from './workbench-longpress.js';

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  document.body.replaceChildren();
  vi.useRealTimers();
});

const pointer = (type: string, init: Record<string, unknown> = {}): PointerEvent =>
  new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    isPrimary: true,
    pointerType: 'touch',
    button: 0,
    clientX: 20,
    clientY: 30,
    pointerId: 7,
    ...init
  });

function attach(element: HTMLElement, onLongPress: (event: PointerEvent) => void) {
  const cleanup = attachWorkbenchLongPress(element, { onLongPress });
  cleanups.push(cleanup);
  return cleanup;
}

describe('触屏长按', () => {
  it('按住超过阈值触发一次回调，携带按下位置', () => {
    vi.useFakeTimers();
    const element = document.createElement('button');
    document.body.append(element);
    const onLongPress = vi.fn();
    attach(element, onLongPress);
    element.dispatchEvent(pointer('pointerdown', { clientX: 40, clientY: 60 }));
    vi.advanceTimersByTime(499);
    expect(onLongPress).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onLongPress).toHaveBeenCalledOnce();
    const event = onLongPress.mock.calls[0][0];
    expect(event.clientX).toBe(40);
    expect(event.clientY).toBe(60);
    vi.advanceTimersByTime(1000);
    expect(onLongPress).toHaveBeenCalledOnce();
  });

  it('移动超过容差取消长按', () => {
    vi.useFakeTimers();
    const element = document.createElement('button');
    document.body.append(element);
    const onLongPress = vi.fn();
    attach(element, onLongPress);
    element.dispatchEvent(pointer('pointerdown'));
    vi.advanceTimersByTime(200);
    element.dispatchEvent(pointer('pointermove', { clientX: 31, clientY: 30 }));
    vi.advanceTimersByTime(400);
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('触发后吞掉随后的 click，防止误打开', () => {
    vi.useFakeTimers();
    const element = document.createElement('button');
    const parent = document.createElement('div');
    parent.append(element);
    document.body.append(parent);
    const onClick = vi.fn();
    parent.addEventListener('click', onClick);
    const onLongPress = vi.fn();
    attach(element, onLongPress);
    element.dispatchEvent(pointer('pointerdown'));
    vi.advanceTimersByTime(500);
    expect(onLongPress).toHaveBeenCalledOnce();
    element.dispatchEvent(pointer('pointerup'));
    element.click();
    expect(onClick).not.toHaveBeenCalled();
    element.click();
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('鼠标指针不触发长按', () => {
    vi.useFakeTimers();
    const element = document.createElement('button');
    document.body.append(element);
    const onLongPress = vi.fn();
    attach(element, onLongPress);
    element.dispatchEvent(pointer('pointerdown', { pointerType: 'mouse' }));
    vi.advanceTimersByTime(1000);
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('释放监听后不再触发', () => {
    vi.useFakeTimers();
    const element = document.createElement('button');
    document.body.append(element);
    const onLongPress = vi.fn();
    const cleanup = attach(element, onLongPress);
    cleanup();
    element.dispatchEvent(pointer('pointerdown'));
    vi.advanceTimersByTime(1000);
    expect(onLongPress).not.toHaveBeenCalled();
  });
});
