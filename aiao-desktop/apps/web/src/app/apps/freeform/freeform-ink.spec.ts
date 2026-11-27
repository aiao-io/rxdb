import { describe, expect, it } from 'vitest';

import { Ink, Stroke, StrokeUndo, isStroke, unsettled, visibleStrokes } from './freeform-ink';

const ink = (id: string, color = '#1d1d1f'): Ink => ({
  id,
  color,
  points: [
    [0, 0],
    [4, 4]
  ]
});

describe('isStroke', () => {
  it('只有一个点画不出线，不算一笔', () => {
    expect(isStroke({ color: '#000', points: [[1, 1]] })).toBe(false);
    expect(isStroke({ color: '#000', points: [] })).toBe(false);
  });

  it('两个点起就是一笔', () => {
    expect(
      isStroke({
        color: '#000',
        points: [
          [1, 1],
          [2, 2]
        ]
      })
    ).toBe(true);
  });
});

describe('unsettled', () => {
  it('库里已经有的笔迹不再等', () => {
    const rest = unsettled([ink('a'), ink('b'), ink('c')], [{ id: 'b' }, { id: 'x' }]);

    expect(rest.map(item => item.id)).toEqual(['a', 'c']);
  });

  it('库里一条也没有时，全部都还在等', () => {
    expect(unsettled([ink('a'), ink('b')], []).map(item => item.id)).toEqual(['a', 'b']);
  });
});

describe('visibleStrokes', () => {
  it('依次是库里的、尚未回报的、正在画的', () => {
    const drawing: Stroke = { color: '#ff375f', points: [[9, 9]] };

    const strokes = visibleStrokes([ink('a'), ink('b')], [ink('c')], drawing);

    expect(strokes).toEqual([ink('a'), ink('b'), ink('c'), drawing]);
  });

  it('库已回报的笔迹只画一次，不会和本窗口的副本画两遍', () => {
    const strokes = visibleStrokes([ink('a'), ink('b')], [ink('b'), ink('c')], null);

    expect(strokes.map(stroke => (stroke as Ink).id)).toEqual(['a', 'b', 'c']);
  });

  it('什么都没有时是空画板', () => {
    expect(visibleStrokes([], [], null)).toEqual([]);
  });
});

describe('StrokeUndo', () => {
  const entry = (id: string): { id: string; color: string; points: readonly (readonly [number, number])[] } => ({
    id,
    color: '#1d1d1f',
    points: [
      [0, 0],
      [4, 4]
    ]
  });

  it('undo 弹出最后一笔并放进重做栈，redo 取回', () => {
    const stack = new StrokeUndo();
    stack.push(entry('a'));
    stack.push(entry('b'));
    expect(stack.undoSize()).toBe(2);
    expect(stack.undoTop()?.id).toBe('b');
    expect(stack.undoSize()).toBe(1);
    expect(stack.redoSize()).toBe(1);
    expect(stack.redoTop()?.id).toBe('b');
    expect(stack.redoSize()).toBe(0);
    expect(stack.undoTop()?.id).toBe('a');
  });

  it('新的一笔清空重做栈', () => {
    const stack = new StrokeUndo();
    stack.push(entry('a'));
    stack.undoTop();
    expect(stack.redoSize()).toBe(1);
    stack.push(entry('b'));
    expect(stack.redoSize()).toBe(0);
  });

  it('空栈弹出 null，清空后两个栈都归零', () => {
    const stack = new StrokeUndo();
    expect(stack.undoTop()).toBeNull();
    expect(stack.redoTop()).toBeNull();
    stack.push(entry('a'));
    stack.undoTop();
    stack.forgetAll();
    expect(stack.undoSize()).toBe(0);
    expect(stack.redoSize()).toBe(0);
  });
});
