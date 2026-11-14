/** 画布布局常量 */
export const LAYOUT = {
  START_X: 100,
  START_Y: 100,
  COLS_PER_ROW: 3,
  COL_GAP: 200,
  ROW_GAP: 250,
  NODE_WIDTH: 240
} as const;

/**
 * 计算新实体画布布局位置
 *
 * 网格排布：每行 3 个，从现有实体右侧或 (100, 100) 开始。
 */
export function calculateLayout(
  count: number,
  existingEntities: { nodeX: number; nodeY: number; nodeWidth?: number }[]
): { x: number; y: number }[] {
  let startX: number = LAYOUT.START_X;
  let startY: number = LAYOUT.START_Y;

  if (existingEntities.length > 0) {
    const maxRight = Math.max(...existingEntities.map(e => e.nodeX + (e.nodeWidth ?? LAYOUT.NODE_WIDTH)));
    startX = maxRight + LAYOUT.COL_GAP;
    const minY = Math.min(...existingEntities.map(e => e.nodeY));
    startY = minY;
  }

  const positions: { x: number; y: number }[] = [];
  for (let i = 0; i < count; i++) {
    const col = i % LAYOUT.COLS_PER_ROW;
    const row = Math.floor(i / LAYOUT.COLS_PER_ROW);
    positions.push({
      x: startX + col * (LAYOUT.NODE_WIDTH + LAYOUT.COL_GAP),
      y: startY + row * LAYOUT.ROW_GAP
    });
  }

  return positions;
}
