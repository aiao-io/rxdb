// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyPopoverPosition,
  calcPopoverPosition,
  findOptionLabel
} from '../../../query-builder/utils/popover-position.js';

function makeRect(left: number, top: number, width: number, height: number): DOMRect {
  return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) };
}

describe('calcPopoverPosition', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerHeight', { value: 800, writable: true });
  });

  it('places below when enough space', () => {
    const rect = makeRect(100, 40, 200, 30);
    const pos = calcPopoverPosition(rect);
    expect(pos).toEqual({ left: 100, top: 72, minWidth: 200 });
  });

  it('places above when not enough space below', () => {
    const rect = makeRect(100, 750, 200, 30);
    const pos = calcPopoverPosition(rect);
    expect(pos).toEqual({ left: 100, bottom: 52, minWidth: 200 });
  });

  it('respects custom gap and minSpaceBelow', () => {
    const rect = makeRect(50, 600, 120, 30);
    const pos = calcPopoverPosition(rect, 4, 200);
    expect(pos).toEqual({ left: 50, bottom: 204, minWidth: 120 });
  });
});

describe('applyPopoverPosition', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerHeight', { value: 800, writable: true });
  });

  it('applies styles for below placement', () => {
    const el = document.createElement('div');
    const rect = makeRect(100, 40, 200, 30);
    applyPopoverPosition(el, rect);
    expect(el.style.position).toBe('fixed');
    expect(el.style.margin).toBe('0px');
    expect(el.style.inset).toBe('unset');
    expect(el.style.left).toBe('100px');
    expect(el.style.top).toBe('72px');
    expect(el.style.bottom).toBe('unset');
  });

  it('applies styles for above placement', () => {
    const el = document.createElement('div');
    const rect = makeRect(100, 750, 200, 30);
    applyPopoverPosition(el, rect);
    expect(el.style.top).toBe('unset');
    expect(el.style.bottom).toBe('52px');
  });
});

describe('findOptionLabel', () => {
  const options = [
    { value: 'a', label: 'Alpha' },
    { value: 'b', label: 'Beta' }
  ];

  it('returns label for matching value', () => {
    expect(findOptionLabel(options, 'b', 'Select')).toBe('Beta');
  });

  it('returns placeholder when no match', () => {
    expect(findOptionLabel(options, 'z', 'Select')).toBe('Select');
  });
});
