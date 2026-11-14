import { describe, expect, it } from 'vitest';
import { calculateLayout } from '../../services/ai-model-layout';

describe('calculateLayout', () => {
  it('空画布从 (100, 100) 开始排布', () => {
    expect(calculateLayout(3, [])[0]).toEqual({ x: 100, y: 100 });
  });

  it('有已有实体时排在它们右侧', () => {
    expect(calculateLayout(1, [{ nodeX: 200, nodeY: 100, nodeWidth: 240 }])[0].x).toBeGreaterThan(200);
  });

  it('每行 3 个，第 4 个换行', () => {
    const positions = calculateLayout(6, []);
    expect(positions[0].y).toBe(positions[1].y);
    expect(positions[3].y).toBeGreaterThan(positions[0].y);
  });
});
