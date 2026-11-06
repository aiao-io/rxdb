import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { transitionImage } from './image-view-transition';

const originalTransition = Object.getOwnPropertyDescriptor(document, 'startViewTransition');

beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false }))
  );
});
afterEach(() => {
  if (originalTransition) Object.defineProperty(document, 'startViewTransition', originalTransition);
  else Reflect.deleteProperty(document, 'startViewTransition');
  document.documentElement.classList.remove('template-image-transition');
  vi.unstubAllGlobals();
});

function images() {
  return { source: document.createElement('img'), target: document.createElement('img') };
}

function nativeTransition(ready: Promise<void> = Promise.resolve()) {
  let update!: () => Promise<void>;
  let finish!: () => void;
  const finished = new Promise<void>(resolve => (finish = resolve));
  const skip = vi.fn(() => finish());
  const start = vi.fn((callback: () => Promise<void>) => {
    update = callback;
    return { ready, finished, skipTransition: skip };
  });
  Object.defineProperty(document, 'startViewTransition', { value: start, configurable: true });
  return { start, finish, skip, update: () => update() };
}

describe('灵感图片共享元素过渡', () => {
  it('从点击图片取旧快照，等弹窗渲染后把同一个过渡名称交给大图', async () => {
    const { source, target } = images();
    const native = nativeTransition();
    let rendered!: (image: HTMLImageElement) => void;
    const render = new Promise<HTMLImageElement>(resolve => (rendered = resolve));
    const change = vi.fn(() => render);
    const done = transitionImage(source, change);
    expect(native.start).toHaveBeenCalledOnce();
    expect(change).not.toHaveBeenCalled();
    expect(source.style.viewTransitionName).toBe('template-image');
    expect(target.style.viewTransitionName).toBe('');
    expect(document.documentElement.classList.contains('template-image-transition')).toBe(true);
    const updating = native.update();
    expect(source.style.viewTransitionName).toBe('');
    rendered(target);
    await updating;
    expect(target.style.viewTransitionName).toBe('template-image');
    native.finish();
    await done;
    expect(source.style.viewTransitionName).toBe('');
    expect(target.style.viewTransitionName).toBe('');
    expect(document.documentElement.classList.contains('template-image-transition')).toBe(false);
  });

  it('关闭时把大图的名称交回原卡片', async () => {
    const { source: cover, target: detail } = images();
    const native = nativeTransition();
    const done = transitionImage(detail, async () => cover);
    expect(detail.style.viewTransitionName).toBe('template-image');
    await native.update();
    expect(detail.style.viewTransitionName).toBe('');
    expect(cover.style.viewTransitionName).toBe('template-image');
    native.finish();
    await done;
    expect(cover.style.viewTransitionName).toBe('');
  });

  it('快速关闭时先结束上次过渡，避免两个快照争用同一个图片名称', async () => {
    const { source: cover, target: detail } = images();
    const opening = nativeTransition();
    const opened = transitionImage(cover, async () => detail);
    await opening.update();
    const closing = nativeTransition();
    const closed = transitionImage(detail, async () => cover);
    expect(opening.skip).toHaveBeenCalledOnce();
    expect(closing.start).not.toHaveBeenCalled();
    await opened;
    await vi.waitFor(() => expect(closing.start).toHaveBeenCalledOnce());
    expect(detail.style.viewTransitionName).toBe('template-image');
    await closing.update();
    expect(cover.style.viewTransitionName).toBe('template-image');
    closing.finish();
    await closed;
    expect(cover.style.viewTransitionName).toBe('');
    expect(detail.style.viewTransitionName).toBe('');
  });

  it('浏览器跳过动画时仍完成界面更新和清理', async () => {
    const native = nativeTransition(Promise.reject(new DOMException('过渡被跳过', 'AbortError')));
    const { source, target } = images();
    const done = transitionImage(source, async () => target);
    await native.update();
    native.finish();
    await done;
    expect(source.style.viewTransitionName).toBe('');
    expect(target.style.viewTransitionName).toBe('');
    expect(document.documentElement.classList.contains('template-image-transition')).toBe(false);
  });

  it('浏览器不支持时直接完成界面更新', async () => {
    Object.defineProperty(document, 'startViewTransition', { value: undefined, configurable: true });
    const { source, target } = images();
    const change = vi.fn(async () => target);
    await transitionImage(source, change);
    expect(change).toHaveBeenCalledOnce();
    expect(source.style.viewTransitionName).toBe('');
    expect(target.style.viewTransitionName).toBe('');
  });

  it('减少动态效果时直接打开和关闭', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true }))
    );
    const native = nativeTransition();
    const { source, target } = images();
    const change = vi.fn(async () => target);
    await transitionImage(source, change);
    expect(native.start).not.toHaveBeenCalled();
    expect(change).toHaveBeenCalledOnce();
  });

  it('图片加载失败而没有源元素时仍能打开详情', async () => {
    const native = nativeTransition();
    const change = vi.fn(async () => null);
    await transitionImage(null, change);
    expect(native.start).not.toHaveBeenCalled();
    expect(change).toHaveBeenCalledOnce();
  });

  it('弹窗图片不可用时仍完成更新并清理源元素', async () => {
    const native = nativeTransition();
    const { source } = images();
    const done = transitionImage(source, async () => null);
    await native.update();
    native.finish();
    await done;
    expect(source.style.viewTransitionName).toBe('');
    expect(document.documentElement.classList.contains('template-image-transition')).toBe(false);
  });
});
