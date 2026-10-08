import type { Locator, Page } from '@playwright/test';

/** 落点：目标行的上沿 / 下沿 / 中间。 */
export type DragRowPosition = 'before' | 'after' | 'into';

/**
 * 三档落点取目标行高的比例。落点区间是三等分（上 1/3 为前、下 1/3 为后、中间为内），
 * 15% / 85% / 50% 离 1/3、2/3 边界都足够远，抖动一两个像素不会换档。
 */
const OFFSET_RATIO: Record<DragRowPosition, number> = { before: 0.15, into: 0.5, after: 0.85 };

/** 从源行手柄到目标行的分步移动次数：足够多的中间 `dragover`，让页面把落点判定到最后一档。 */
const MOVE_STEPS = 20;

export interface DragRowOptions {
  /** 在松开鼠标前执行：此时拖动还在进行，可以断言目标行的 `data-drop-mode` / `data-drop-valid`。 */
  beforeDrop?: () => Promise<void>;
}

/**
 * 用真实鼠标把一行拖到另一行的上沿 / 下沿 / 中间（HTML5 拖放，不触发合成事件）。
 *
 * @remarks
 * 鼠标移到源行的拖动手柄 → 按下 → 分 20 步移到目标行的落点 → 再移动一步 → 松开。
 * 松开前多停的一步让页面按最终位置重新判定一次落点，避免 `dragover` 节流让最后一次判定滞后。
 * 三端的 `drag-utils.ts` 签名与行为相同。
 *
 * @param page - 页面
 * @param source - 被拖行（`menu-row` / `file-row`）
 * @param target - 目标行
 * @param position - 落点：目标行上沿、下沿或中间
 * @param options - 见 {@link DragRowOptions}
 */
export async function dragRowTo(
  page: Page,
  source: Locator,
  target: Locator,
  position: DragRowPosition,
  options: DragRowOptions = {}
): Promise<void> {
  await source.scrollIntoViewIfNeeded();
  const handleBox = await source.getByTestId(/drag-handle$/u).boundingBox();
  if (!handleBox) throw new Error('无法获取源行拖动手柄的位置');

  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();

  // 开始拖动后再取目标行的位置：拖动开始时源行会加高亮样式，布局可能有极小位移
  await target.scrollIntoViewIfNeeded();
  const targetBox = await target.boundingBox();
  if (!targetBox) throw new Error('无法获取目标行的位置');
  const x = targetBox.x + targetBox.width / 2;
  const y = targetBox.y + targetBox.height * OFFSET_RATIO[position];

  await page.mouse.move(x, y, { steps: MOVE_STEPS });
  await page.mouse.move(x, y + 1);
  await options.beforeDrop?.();
  await page.mouse.up();
}
