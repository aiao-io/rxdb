import type { Locator, Page } from '@playwright/test';
import { expect } from './fixtures.js';

/** 落点：目标行上方 / 下方 / 拖进。 */
export type DropPosition = 'before' | 'after' | 'into';

/** 落点在目标行高上的位置：15% 落进上三分之一、85% 落进下三分之一、50% 落进中间（离 1/3、2/3 边界足够远）。 */
const POSITION_FRACTION: Record<DropPosition, number> = { before: 0.15, into: 0.5, after: 0.85 };

/** 拖动中等待页面把落点高亮切到目标档位的上限。 */
const HOVER_TIMEOUT = 5000;

type Box = NonNullable<Awaited<ReturnType<Locator['boundingBox']>>>;

/** 取布局盒；取不到就以一条能指认现场的错误失败（`expect(...).toBeTruthy()` 不会收窄类型）。 */
async function requireBox(locator: Locator, what: string): Promise<Box> {
  const box = await locator.boundingBox();
  if (box === null) {
    throw new Error(`${what}没有布局盒（可能被遮挡或尚未渲染）`);
  }
  return box;
}

/**
 * 真实鼠标拖到目标行的指定落点，但不松开：按下后停在落点上，供调用方断言拖动中的高亮
 * （`data-drop-mode` / `data-drop-valid`），再自行 `page.mouse.up()`。
 *
 * @remarks
 * 起点：有拖拽手柄（`menu-drag-handle`）的行取手柄中心，否则取行中心。
 * 路径：`move` 到起点 → `down` → 分 20 步 `move` 到目标行高的 15% / 85% / 50% → 再 `move` 一步（保证最后一个 `dragover` 落在该点）。
 * 返回前确认目标行的 `data-drop-mode` 已切到 `position`。
 *
 * @param page - 页面
 * @param source - 被拖的行
 * @param target - 目标行
 * @param position - 落点
 */
export async function dragRowOver(page: Page, source: Locator, target: Locator, position: DropPosition): Promise<void> {
  const handle = source.getByTestId('menu-drag-handle');
  const hasHandle = (await handle.count()) > 0;
  const from = await requireBox(hasHandle ? handle : source, '拖拽起点');
  const to = await requireBox(target, '拖拽目标行');

  const toX = to.x + to.width / 2;
  const toY = to.y + to.height * POSITION_FRACTION[position];

  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(toX, toY, { steps: 20 });
  await page.mouse.move(toX + 1, toY);
  await expect(target).toHaveAttribute('data-drop-mode', position, { timeout: HOVER_TIMEOUT });
}

/**
 * 真实鼠标把 `source` 行拖到 `target` 行的指定落点并松开。
 *
 * @param page - 页面
 * @param source - 被拖的行
 * @param target - 目标行
 * @param position - 落点：`before` 目标行上三分之一、`after` 下三分之一、`into` 中间
 */
export async function dragRowTo(page: Page, source: Locator, target: Locator, position: DropPosition): Promise<void> {
  await dragRowOver(page, source, target, position);
  await page.mouse.up();
}
