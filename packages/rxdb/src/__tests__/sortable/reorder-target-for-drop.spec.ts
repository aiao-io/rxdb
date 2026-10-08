/**
 * @fileoverview 树页面「放到某行上方 / 下方」到重排目标的换算（US-031 阶段 B）
 *
 * 树的拖放不是「第 from 行拖到第 to 行」：跨父放置时被拖行不在目标组里，落点只能说成
 * 「目标行的上方 / 下方」。三端树页面都经这一个纯函数换算，免得三份实现各自漂移。
 */
import { describe, expect, it } from 'vitest';
import { reorderTargetForDrop } from '../../sortable/sortable.utils.js';

const GROUP = ['a', 'b', 'c', 'd'] as const;

describe('reorderTargetForDrop', () => {
  it('同组下移到两邻之间：放在 a 下方得到 a、b', () => {
    expect(reorderTargetForDrop(GROUP, 'd', 'a', 'after')).toEqual({ prevId: 'a', nextId: 'b' });
  });

  it('同组上移到组首：放在 a 上方，前邻为 null', () => {
    expect(reorderTargetForDrop(GROUP, 'c', 'a', 'before')).toEqual({ prevId: null, nextId: 'a' });
  });

  it('同组移到组尾：放在 d 下方，后邻为 null', () => {
    expect(reorderTargetForDrop(GROUP, 'a', 'd', 'after')).toEqual({ prevId: 'd', nextId: null });
  });

  it('原位：放在自己的后邻上方返回 null', () => {
    expect(reorderTargetForDrop(['a', 'b', 'c'], 'a', 'b', 'before')).toBeNull();
  });

  it('原位：放在自己的前邻下方返回 null', () => {
    expect(reorderTargetForDrop(['a', 'b', 'c'], 'c', 'b', 'after')).toBeNull();
  });

  it('邻居跳过被拖行自己：a 放到 c 上方得到 b、c', () => {
    expect(reorderTargetForDrop(['a', 'b', 'c'], 'a', 'c', 'before')).toEqual({ prevId: 'b', nextId: 'c' });
  });

  it('跨组：被拖行不在目标组里，放在 q1 下方得到 q1、q2', () => {
    expect(reorderTargetForDrop(['q1', 'q2'], 'p1', 'q1', 'after')).toEqual({ prevId: 'q1', nextId: 'q2' });
  });

  it('跨组到组首：放在唯一兄弟上方，前邻为 null', () => {
    expect(reorderTargetForDrop(['q1'], 'p1', 'q1', 'before')).toEqual({ prevId: null, nextId: 'q1' });
  });

  it('拖到自己上抛 RangeError', () => {
    expect(() => reorderTargetForDrop(['a', 'b'], 'a', 'a', 'before')).toThrow(RangeError);
  });

  it('目标不在组里抛 RangeError', () => {
    expect(() => reorderTargetForDrop(['a', 'b'], 'a', 'x', 'after')).toThrow(RangeError);
  });
});
