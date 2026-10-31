import type { UUID } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';

import { dropIndicatorAnchor } from '../drop-resolution.js';

const id = (value: string) => value as UUID;
const column = id('C');

/**
 * 落点反馈的可见锚点（看板 v2 筛选状态下拖拽）：落点邻居取自完整序列，
 * 插入线却只能画在看得见的卡片上。
 */
describe('dropIndicatorAnchor（插入线锚点）', () => {
  it('没有筛选：前邻居之后，列首落点画在后邻居之前', () => {
    const all = [id('a'), id('b')];
    expect(dropIndicatorAnchor({ kind: 'between', columnId: column, prevId: id('a'), nextId: id('b') }, all)).toEqual({
      mode: 'after',
      taskId: 'a'
    });
    expect(dropIndicatorAnchor({ kind: 'between', columnId: column, prevId: null, nextId: id('a') }, all)).toEqual({
      mode: 'before',
      taskId: 'a'
    });
  });

  it('前邻居被筛掉：改画在可见的后邻居之前', () => {
    expect(
      dropIndicatorAnchor({ kind: 'between', columnId: column, prevId: id('b'), nextId: id('c') }, [id('a'), id('c')])
    ).toEqual({ mode: 'before', taskId: 'c' });
  });

  it('两侧邻居都被筛掉或空列追加：返回 null（调用方退回整列高亮）', () => {
    expect(
      dropIndicatorAnchor({ kind: 'between', columnId: column, prevId: id('b'), nextId: null }, [id('a')])
    ).toBeNull();
    expect(dropIndicatorAnchor({ kind: 'end', columnId: column }, [])).toBeNull();
  });
});
