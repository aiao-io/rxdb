/**
 * 等高虚拟列表的指针拖拽内核（US-028 阶段 E）。
 *
 * @remarks
 * 三端 todo 页都是等高行的虚拟滚动，视口外的行不在 DOM 里——落点只能按指针位置换算下标，
 * 不能靠「指针下是哪个 DOM 行」。换算、贴边自动滚动、松手 / 取消的收尾在这里只写一份，三端只做适配。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FixedRowDrag, type FixedRowDragState } from '../../@browser/fixed-row-drag.js';

const ROW = 40;

/** 滚动容器视口 [100, 500)；列表顶边随 scrollTop 上移 */
const setup = (rowCount: number) => {
  const scrollElement = document.createElement('div');
  const listElement = document.createElement('div');
  let scrollTop = 0;
  Object.defineProperty(scrollElement, 'scrollTop', {
    get: () => scrollTop,
    set: (value: number) => {
      scrollTop = Math.max(0, Math.min(value, rowCount * ROW - 400));
    }
  });
  scrollElement.getBoundingClientRect = () => DOMRect.fromRect({ x: 0, y: 100, width: 300, height: 400 });
  listElement.getBoundingClientRect = () =>
    DOMRect.fromRect({ x: 0, y: 100 - scrollTop, width: 300, height: rowCount * ROW });
  const states: (FixedRowDragState | null)[] = [];
  const onDrop = vi.fn<(from: number, to: number) => void>();
  const drag = new FixedRowDrag({
    rowHeight: ROW,
    scrollElement: () => scrollElement,
    listElement: () => listElement,
    onChange: state => states.push(state),
    onDrop
  });
  return { drag, states, onDrop, scrollElement };
};

const pointer = (type: string, clientY: number) => new PointerEvent(type, { clientY, button: 0, bubbles: true });

describe('FixedRowDrag', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('按指针相对列表顶边的位置换算落点下标，松手回调 from / to', () => {
    const { drag, states, onDrop } = setup(10);
    drag.start(pointer('pointerdown', 110), 0, 10);
    expect(drag.dragging).toBe(true);
    expect(states.at(-1)).toEqual({ fromIndex: 0, overIndex: 0 });

    window.dispatchEvent(pointer('pointermove', 100 + ROW * 3 + 5));
    expect(states.at(-1)).toEqual({ fromIndex: 0, overIndex: 3 });

    window.dispatchEvent(pointer('pointerup', 100 + ROW * 3 + 5));
    expect(onDrop).toHaveBeenCalledWith(0, 3);
    expect(states.at(-1)).toBeNull();
    expect(drag.dragging).toBe(false);
  });

  it('落点钳在 [0, rowCount-1]', () => {
    const { drag, states } = setup(5);
    drag.start(pointer('pointerdown', 150), 1, 5);
    window.dispatchEvent(pointer('pointermove', -500));
    expect(states.at(-1)).toEqual({ fromIndex: 1, overIndex: 0 });
    window.dispatchEvent(pointer('pointermove', 5000));
    expect(states.at(-1)).toEqual({ fromIndex: 1, overIndex: 4 });
    drag.cancel();
  });

  it('指针停在视口下沿时逐帧滚动，落点随滚动推进到视口外的行', () => {
    const { drag, states, scrollElement, onDrop } = setup(100);
    drag.start(pointer('pointerdown', 110), 0, 100);
    window.dispatchEvent(pointer('pointermove', 495));
    vi.advanceTimersToNextFrame();
    vi.advanceTimersToNextFrame();
    expect(scrollElement.scrollTop).toBeGreaterThan(0);
    const before = states.at(-1)?.overIndex ?? -1;
    for (let frame = 0; frame < 30; frame++) vi.advanceTimersToNextFrame();
    const after = states.at(-1)?.overIndex ?? -1;
    expect(after).toBeGreaterThan(before);
    expect(after).toBeGreaterThan(9);

    window.dispatchEvent(pointer('pointerup', 495));
    expect(onDrop).toHaveBeenCalledWith(0, after);
    const settled = scrollElement.scrollTop;
    vi.advanceTimersToNextFrame();
    expect(scrollElement.scrollTop).toBe(settled);
  });

  it('指针停在视口上沿时向上滚动', () => {
    const { drag, scrollElement } = setup(100);
    scrollElement.scrollTop = 800;
    drag.start(pointer('pointerdown', 300), 25, 100);
    window.dispatchEvent(pointer('pointermove', 102));
    vi.advanceTimersToNextFrame();
    expect(scrollElement.scrollTop).toBeLessThan(800);
    drag.cancel();
  });

  it('Escape 与 pointercancel 取消拖拽，不回调 onDrop', () => {
    const { drag, states, onDrop } = setup(10);
    drag.start(pointer('pointerdown', 110), 0, 10);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(drag.dragging).toBe(false);
    expect(states.at(-1)).toBeNull();

    drag.start(pointer('pointerdown', 110), 0, 10);
    window.dispatchEvent(pointer('pointercancel', 200));
    expect(drag.dragging).toBe(false);
    expect(onDrop).not.toHaveBeenCalled();
  });

  it('非主键按下与拖拽中再次按下都不开始新的拖拽', () => {
    const { drag, states } = setup(10);
    drag.start(new PointerEvent('pointerdown', { clientY: 110, button: 2 }), 0, 10);
    expect(drag.dragging).toBe(false);
    drag.start(pointer('pointerdown', 110), 0, 10);
    drag.start(pointer('pointerdown', 190), 2, 10);
    expect(states.at(-1)).toEqual({ fromIndex: 0, overIndex: 0 });
    drag.dispose();
    expect(drag.dragging).toBe(false);
  });

  it('起点下标越界抛 RangeError', () => {
    const { drag } = setup(3);
    expect(() => drag.start(pointer('pointerdown', 110), 3, 3)).toThrow(RangeError);
  });
});

describe('FixedRowDrag 构造参数', () => {
  it('rowHeight 非正有限数抛 RangeError', () => {
    const element = () => document.createElement('div');
    const base = { scrollElement: element, listElement: element, onChange: () => undefined, onDrop: () => undefined };
    expect(() => new FixedRowDrag({ ...base, rowHeight: 0 })).toThrow(RangeError);
    expect(() => new FixedRowDrag({ ...base, rowHeight: Number.NaN })).toThrow(RangeError);
  });
});
