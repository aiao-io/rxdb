import { describe, expect, it } from 'vitest';

import { Ink, Stroke, isStroke, unsettled, visibleStrokes } from './freeform-ink';

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
