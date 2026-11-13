/** 图标在屏幕上的盒子（图标视图按几何找方向键的邻居）。 */
export interface ItemRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** 线性视图里哪一对方向键起作用：列表与分栏的一栏是竖向，画廊的缩略图条是横向。 */
export type Axis = 'vertical' | 'horizontal';

/**
 * 列表、分栏的一栏、画廊的缩略图条里，方向键要去的下标：沿着 `axis` 前进 / 后退一项，到头留在原地（不循环，
 * 与 Finder 一致）；Home、End 去两端。没有当前项（`at` 为 -1）时，前进去第一项、后退去最后一项。
 * 不是这个视图的导航键、或没有任何项时为 `null`。
 */
export function linearTarget(key: string, at: number, count: number, axis: Axis): number | null {
  if (count === 0) return null;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  const [forward, backward] = axis === 'vertical' ? ['ArrowDown', 'ArrowUp'] : ['ArrowRight', 'ArrowLeft'];
  if (key === forward) return at < 0 ? 0 : Math.min(at + 1, count - 1);
  if (key === backward) return at < 0 ? count - 1 : Math.max(at - 1, 0);
  return null;
}

const centreX = (rect: ItemRect): number => rect.x + rect.width / 2;
const centreY = (rect: ItemRect): number => rect.y + rect.height / 2;

/**
 * 图标视图里方向键要去的下标。左右是文档顺序里的前一个、后一个（行尾接下一行行首，到头留在原地）；
 * 上下是上一行、下一行里水平位置最接近的图标，没有更上 / 更下的行就留在原地；Home、End 去两端。
 * 没有当前项（`at` 为 -1）时，向下、向右去第一个，向上、向左去最后一个。
 */
export function gridTarget(key: string, at: number, rects: readonly ItemRect[]): number | null {
  if (rects.length === 0) return null;
  if (key === 'Home') return 0;
  if (key === 'End') return rects.length - 1;
  if (key === 'ArrowRight' || key === 'ArrowLeft') return linearTarget(key, at, rects.length, 'horizontal');
  if (key !== 'ArrowDown' && key !== 'ArrowUp') return null;
  if (at < 0) return key === 'ArrowDown' ? 0 : rects.length - 1;
  return nextRow(rects, at, key === 'ArrowDown' ? 1 : -1);
}

/** 上一行（`direction` 为 -1）或下一行里水平位置最接近 `at` 的图标；没有更远的行时就是 `at` 自己。 */
function nextRow(rects: readonly ItemRect[], at: number, direction: 1 | -1): number {
  const current = rects[at];
  const edge = centreY(current) + (direction * current.height) / 2;
  const beyond = rects
    .map((rect, index) => ({ index, y: centreY(rect), dx: Math.abs(centreX(rect) - centreX(current)) }))
    .filter(item => (direction === 1 ? item.y > edge : item.y < edge));
  if (beyond.length === 0) return at;
  const row = direction === 1 ? Math.min(...beyond.map(item => item.y)) : Math.max(...beyond.map(item => item.y));
  const inRow = beyond.filter(item => Math.abs(item.y - row) < current.height / 2);
  return inRow.reduce((best, item) => (item.dx < best.dx ? item : best)).index;
}

/** 回到上一级目录的按键：Backspace，或 ⌘↑（Ctrl+↑）。单独的 ↑ 是移动选择。 */
export const isGoUp = (event: KeyboardEvent): boolean =>
  event.key === 'Backspace' || (event.key === 'ArrowUp' && Boolean(event.metaKey || event.ctrlKey));

/** 条目的无障碍名称：名称加种类，读屏在按 Enter 之前就知道它是文件夹还是文件。 */
export const itemLabel = (node: { readonly name: string; readonly kind: string; readonly k?: string }): string =>
  `${node.name}, ${node.k || (node.kind === 'folder' ? 'Folder' : 'Document')}`;
