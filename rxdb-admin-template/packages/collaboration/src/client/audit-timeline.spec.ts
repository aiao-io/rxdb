import { describe, expect, it } from 'vitest';
import type { Audit } from '../model.js';
import { AuditTimeline } from './audit-timeline.js';

const event = (id: number): Audit => ({
  id: `e${id}`,
  actorId: 'admin',
  action: 'task',
  operationId: `op${id}`,
  at: id,
  details: {}
});
/** 完整日志里 [from, to) 的事件，时间正序。 */
const range = (from: number, to: number) => Array.from({ length: to - from }, (_, index) => event(from + index));
const ids = (timeline: AuditTimeline) => timeline.events.map(item => item.id);

describe('audit timeline', () => {
  it('starts from the summary window and knows whether earlier events exist', () => {
    const timeline = new AuditTimeline();
    expect(timeline.events).toEqual([]);
    expect(timeline.hasEarlier).toBe(false);
    timeline.accept(range(70, 120), 120);
    expect(timeline.events).toEqual(range(70, 120));
    expect(timeline.hasEarlier).toBe(true);
    expect(timeline.cursor).toBe('e70');
    timeline.accept(range(0, 20), 20);
    expect(timeline.hasEarlier).toBe(false);
  });
  it('prepends a newest-first page in chronological order and keeps paging back to the start', () => {
    const timeline = new AuditTimeline();
    timeline.accept(range(70, 120), 120);
    expect(timeline.prepend('e70', range(20, 70).reverse())).toBe(true);
    expect(ids(timeline)).toEqual(range(20, 120).map(item => item.id));
    expect(timeline.cursor).toBe('e20');
    expect(timeline.hasEarlier).toBe(true);
    expect(timeline.prepend('e20', range(0, 20).reverse())).toBe(true);
    expect(timeline.events).toEqual(range(0, 120));
    expect(timeline.hasEarlier).toBe(false);
  });
  it('keeps loaded history and appends new events when the next summary window overlaps it', () => {
    const timeline = new AuditTimeline();
    timeline.accept(range(70, 120), 120);
    timeline.prepend('e70', range(20, 70).reverse());
    timeline.accept(range(80, 130), 130);
    expect(timeline.events).toEqual(range(20, 130));
    expect(timeline.hasEarlier).toBe(true);
    timeline.accept(range(80, 130), 130);
    expect(timeline.events).toEqual(range(20, 130));
  });
  it('restarts from the new window when more events than a window arrived, so it never shows a gap', () => {
    const timeline = new AuditTimeline();
    timeline.accept(range(70, 120), 120);
    timeline.prepend('e70', range(20, 70).reverse());
    timeline.accept(range(150, 200), 200);
    expect(timeline.events).toEqual(range(150, 200));
    expect(timeline.cursor).toBe('e150');
    expect(timeline.hasEarlier).toBe(true);
  });
  it('discards an earlier page whose cursor is no longer the oldest event', () => {
    const timeline = new AuditTimeline();
    timeline.accept(range(70, 120), 120);
    timeline.accept(range(150, 200), 200);
    expect(timeline.prepend('e70', range(20, 70).reverse())).toBe(false);
    expect(timeline.events).toEqual(range(150, 200));
    timeline.reset();
    expect(timeline.prepend('e150', range(100, 150).reverse())).toBe(false);
    expect(timeline.events).toEqual([]);
    expect(timeline.cursor).toBeUndefined();
  });
  it('accepts an empty earlier page without changing anything', () => {
    const timeline = new AuditTimeline();
    timeline.accept(range(0, 5), 5);
    expect(timeline.prepend('e0', [])).toBe(true);
    expect(timeline.events).toEqual(range(0, 5));
  });
});
