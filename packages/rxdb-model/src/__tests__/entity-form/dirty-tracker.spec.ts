import { describe, expect, it, vi } from 'vitest';
import { createEntityDirtyTracker, EntityDirtyTracker } from '../../entity-form/dirty-tracker.js';
import * as headless from '../../headless.js';
import * as root from '../../index.js';

/** 一次表单字段变化（只取判定用到的三项）。 */
const change = (field: string, previousValue: unknown, value: unknown) => ({ field, previousValue, value });

describe('EntityDirtyTracker：表单字段', () => {
  it('首次变化的 previousValue 记作基线，取值偏离基线即为未保存，改回基线（结构相同）就不再算', () => {
    const tracker = createEntityDirtyTracker();
    const listener = vi.fn();
    tracker.subscribe(listener);
    expect(tracker.dirty).toBe(false);

    tracker.recordField(change('title', null, '甲'));
    expect(tracker.dirty).toBe(true);
    tracker.recordField(change('title', '甲', '甲乙'));
    tracker.recordField(change('title', '甲乙', null));
    expect(tracker.dirty).toBe(false);

    tracker.recordField(change('tags', ['a'], ['a', 'b']));
    expect(tracker.dirty).toBe(true);
    tracker.recordField(change('tags', ['a', 'b'], ['a']));
    expect(tracker.dirty).toBe(false);
    expect(listener.mock.calls).toEqual([[true], [false], [true], [false]]);
  });

  it('只在状态真正变化时通知：同一状态下的后续输入、重复报告都不再通知', () => {
    const tracker = new EntityDirtyTracker();
    const listener = vi.fn();
    tracker.subscribe(listener);

    tracker.recordField(change('title', '原值', '改1'));
    tracker.recordField(change('title', '改1', '改2'));
    tracker.recordField(change('count', 1, 2));
    tracker.setSource('relation', true);
    tracker.setSource('relation', true);
    expect(listener.mock.calls).toEqual([[true]]);

    tracker.reset();
    tracker.reset();
    tracker.setSource('relation', false);
    expect(listener.mock.calls).toEqual([[true], [false]]);
  });

  it('null、undefined 与空串都算空值：原值是空串的字段，清空输入（解析为 null）不算改动', () => {
    const tracker = createEntityDirtyTracker();
    tracker.recordField(change('note', '', '写了点'));
    tracker.recordField(change('note', '写了点', null));
    expect(tracker.dirty).toBe(false);
    tracker.recordField(change('memo', undefined, ''));
    expect(tracker.dirty).toBe(false);
    // 0、false 与空数组都是真实取值，不算空值
    tracker.recordField(change('count', null, 0));
    expect(tracker.dirty).toBe(true);
  });

  it('多个字段各自对照自己的基线：任一字段仍偏离即为未保存', () => {
    const tracker = createEntityDirtyTracker();
    tracker.recordField(change('title', '原', '新'));
    tracker.recordField(change('count', 1, 2));
    tracker.recordField(change('title', '新', '原'));
    expect(tracker.dirty).toBe(true);
    tracker.recordField(change('count', 2, 1));
    expect(tracker.dirty).toBe(false);
  });

  it('基线与取值留存副本：宿主原地修改数组或对象不会改写判定', () => {
    const tracker = createEntityDirtyTracker();
    const previous = ['a'];
    const next = ['a', 'b'];
    tracker.recordField(change('tags', previous, next));
    next.pop();
    previous.push('z');
    expect(tracker.dirty).toBe(true);
    tracker.recordField(change('tags', ['a', 'b'], ['a']));
    expect(tracker.dirty).toBe(false);
  });
});

describe('EntityDirtyTracker：具名子来源与会话边界', () => {
  it('任一子来源有未保存内容即为 true；全部报告 false 之后回到 false', () => {
    const tracker = createEntityDirtyTracker();
    const listener = vi.fn();
    tracker.subscribe(listener);

    tracker.setSource('dialog', true);
    tracker.setSource('drafts', true);
    tracker.setSource('dialog', false);
    expect(tracker.dirty).toBe(true);
    tracker.setSource('drafts', false);
    expect(tracker.dirty).toBe(false);
    expect(listener.mock.calls).toEqual([[true], [false]]);
  });

  it('reset 结束一次编辑：字段与子来源一起清空，之后的输入按新会话重新取基线', () => {
    const tracker = createEntityDirtyTracker();
    tracker.recordField(change('title', '原', '新'));
    tracker.setSource('relation:children', true);
    tracker.reset();
    expect(tracker.dirty).toBe(false);

    // 保存之后表单显示的是「新」：新会话以它为基线，改回「原」反而是未保存输入
    tracker.recordField(change('title', '新', '原'));
    expect(tracker.dirty).toBe(true);
  });
});

describe('EntityDirtyTracker：订阅即对齐', () => {
  it('订阅时已有未保存输入立即通知 true；取消订阅时仍有就补发 false，取消订阅重复调用无副作用', () => {
    const tracker = createEntityDirtyTracker();
    tracker.recordField(change('title', '原', '新'));
    const listener = vi.fn();
    const unsubscribe = tracker.subscribe(listener);
    expect(listener.mock.calls).toEqual([[true]]);

    unsubscribe();
    unsubscribe();
    expect(listener.mock.calls).toEqual([[true], [false]]);
    tracker.reset();
    tracker.recordField(change('title', '原', '再改'));
    expect(listener.mock.calls).toEqual([[true], [false]]);
  });

  it('干净状态下订阅与取消订阅都不通知；取消订阅只影响自己，其他监听照常收到变化', () => {
    const tracker = createEntityDirtyTracker();
    const first = vi.fn();
    const second = vi.fn();
    const stopFirst = tracker.subscribe(first);
    tracker.subscribe(second);
    stopFirst();
    expect(first).not.toHaveBeenCalled();

    tracker.setSource('dialog', true);
    expect(first).not.toHaveBeenCalled();
    expect(second.mock.calls).toEqual([[true]]);
  });

  it('监听在回调里取消自己的订阅：本轮其余监听照常收到通知', () => {
    const tracker = createEntityDirtyTracker();
    const calls: string[] = [];
    const stop = tracker.subscribe(dirty => {
      calls.push(`first:${dirty}`);
      stop();
    });
    tracker.subscribe(dirty => calls.push(`second:${dirty}`));
    tracker.setSource('dialog', true);
    // 第一个监听收到 true 后立即退订：状态仍是 true，退订时给它补发 false
    expect(calls).toEqual(['first:true', 'first:false', 'second:true']);
  });

  it('监听在回调里退订了别的监听：被退订的那个从没收到过 true，也就不补发 false，本轮不再通知它', () => {
    const tracker = createEntityDirtyTracker();
    const calls: string[] = [];
    let stopSecond = (): void => undefined;
    tracker.subscribe(dirty => {
      calls.push(`first:${dirty}`);
      stopSecond();
    });
    stopSecond = tracker.subscribe(dirty => calls.push(`second:${dirty}`));
    tracker.setSource('dialog', true);
    expect(calls).toEqual(['first:true']);
  });

  it('监听在回调里又改了状态：作废旧的一轮，后面的监听不会收到已经过时的状态', () => {
    const tracker = createEntityDirtyTracker();
    const calls: string[] = [];
    tracker.subscribe(dirty => {
      calls.push(`first:${dirty}`);
      if (dirty) tracker.setSource('dialog', false);
    });
    tracker.subscribe(dirty => calls.push(`second:${dirty}`));
    tracker.setSource('dialog', true);
    // 第二个监听看到的状态始终是 false：它没有收到过时的 true，也就不需要再收一次 false
    expect(calls).toEqual(['first:true', 'first:false']);
    expect(tracker.dirty).toBe(false);
  });
});

describe('EntityDirtyTracker 的入口', () => {
  it('根入口与 headless 入口都导出类与工厂', () => {
    expect(root.EntityDirtyTracker).toBe(EntityDirtyTracker);
    expect(root.createEntityDirtyTracker).toBe(createEntityDirtyTracker);
    expect(headless.EntityDirtyTracker).toBe(EntityDirtyTracker);
    expect(headless.createEntityDirtyTracker).toBe(createEntityDirtyTracker);
    expect(createEntityDirtyTracker()).toBeInstanceOf(EntityDirtyTracker);
  });
});
