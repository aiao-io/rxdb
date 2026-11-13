import { describe, expect, it } from 'vitest';
import { resolveInitialNodePosition } from './design-entity.service';

/**
 * 新建实体的初始坐标不能重叠（US-220 AC#1）。
 *
 * ⚠️ 这条回归防线针对的是一个真实缺陷：旧实现 `(n % 5) * 40` 同时作用于 x 和 y，
 * 把所有实体投影到一条对角线上，第 6 个与第 1 个坐标完全相同。
 * AC#1 的前置条件恰好是「已有 5+ 实体」——缺陷正好落在被验收的那一格里。
 */
describe('resolveInitialNodePosition', () => {
  it('前 100 个实体两两坐标不重合', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const { nodeX, nodeY } = resolveInitialNodePosition(i);
      seen.add(`${nodeX},${nodeY}`);
    }

    expect(seen.size).toBe(100);
  });

  it('第 6 个实体不再落回第 1 个的位置（旧实现的确切失败点）', () => {
    expect(resolveInitialNodePosition(5)).not.toEqual(resolveInitialNodePosition(0));
  });

  it('一行的总宽度留在画布可视区内（x6 不渲染视口外节点）', () => {
    const NODE_WIDTH = 240;
    const rowRightEdge = resolveInitialNodePosition(2).nodeX + NODE_WIDTH;
    expect(rowRightEdge).toBeLessThan(1000);
  });

  it('按行换列：每 3 个换一行，横向宽度有界', () => {
    const first = resolveInitialNodePosition(0);
    const lastOfRow = resolveInitialNodePosition(2);
    const firstOfNextRow = resolveInitialNodePosition(3);

    expect(first.nodeY).toBe(lastOfRow.nodeY);
    expect(firstOfNextRow.nodeY).toBeGreaterThan(first.nodeY);
    expect(firstOfNextRow.nodeX).toBe(first.nodeX);
  });

  it('横向不会无限增长——任意序号的 x 都在一行宽度内', () => {
    const rowWidth = resolveInitialNodePosition(2).nodeX;
    for (const i of [0, 7, 23, 99, 1000]) {
      expect(resolveInitialNodePosition(i).nodeX).toBeLessThanOrEqual(rowWidth);
    }
  });

  it('首个实体落在默认原点', () => {
    expect(resolveInitialNodePosition(0)).toEqual({ nodeX: 100, nodeY: 100 });
  });
});
