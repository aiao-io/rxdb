/**
 * @fileoverview 拖放下标到重排目标的换算（US-028 阶段 E / B 共用）
 *
 * UI 只知道「把第 from 行拖到第 to 行」，`Repository.reorder` 要的是落点前后的邻居 id。
 * 三端 todo 页与 `EntityList` 都经这一个纯函数换算，免得各写一份、各错一处。
 */
import { describe, expect, it } from 'vitest';
import { reorderTargetForMove } from '../../sortable/sortable.utils.js';

const IDS = ['a', 'b', 'c', 'd'] as const;

describe('reorderTargetForMove', () => {
  it('下移：落点之前是原 to 行、之后是原 to+1 行', () => {
    expect(reorderTargetForMove(IDS, 0, 2)).toEqual({ prevId: 'c', nextId: 'd' });
  });

  it('上移：落点之前是原 to-1 行、之后是原 to 行', () => {
    expect(reorderTargetForMove(IDS, 3, 1)).toEqual({ prevId: 'a', nextId: 'b' });
  });

  it('移到首部 prevId 为 null，移到尾部 nextId 为 null', () => {
    expect(reorderTargetForMove(IDS, 2, 0)).toEqual({ prevId: null, nextId: 'a' });
    expect(reorderTargetForMove(IDS, 0, 3)).toEqual({ prevId: 'd', nextId: null });
  });

  it('原位放下返回 null，不产生重排', () => {
    expect(reorderTargetForMove(IDS, 1, 1)).toBeNull();
  });

  it('下标越界或序列不足两行时抛 RangeError', () => {
    expect(() => reorderTargetForMove(IDS, -1, 0)).toThrow(RangeError);
    expect(() => reorderTargetForMove(IDS, 0, 4)).toThrow(RangeError);
    expect(() => reorderTargetForMove(IDS, 1.5, 0)).toThrow(RangeError);
    expect(() => reorderTargetForMove(['a'], 0, 0)).toThrow(RangeError);
  });
});
