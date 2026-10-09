import type { Locator, Page } from '@playwright/test';

/**
 * 树页面拖放的真实鼠标 helper（US-031 阶段 B，三端 `drag-utils.ts` 同签名、同行为）。
 *
 * @remarks
 * 用真实鼠标而不是 `locator.dragTo`：落点取决于指针在目标行内的纵向位置，`dragTo` 只落在行中心。
 * 落点取目标行高的 15% / 50% / 85%，分别落进「上方 / 拖进 / 下方」三档，
 * 离三等分边界（1/3、2/3）足够远。
 */

/** 落点：目标行上方 / 下方 / 拖进目标行 */
export type DropPosition = 'before' | 'after' | 'into';

const POSITION_RATIO: Record<DropPosition, number> = { before: 0.15, into: 0.5, after: 0.85 };
const MOVE_STEPS = 20;

/** 行内的拖拽手柄（菜单与文件管理器共用同一个 title）。 */
const HANDLE_SELECTOR = '[title="拖拽排序"]';

async function requireBox(
  locator: Locator,
  what: string
): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await locator.boundingBox();
  if (!box) throw new Error(`无法获取${what}的位置`);
  return box;
}

/**
 * 按下源行手柄，移动到目标行的指定落点，不松开。
 *
 * @remarks
 * 用于在松开之前断言目标行的 `data-drop-mode` / `data-drop-valid`。
 * 动作：移到源行手柄 → `down` → 分 20 步移到落点 → 再移一步（保证最后一次 `dragover` 落在落点上）。
 *
 * @param page - 页面
 * @param source - 被拖行
 * @param target - 目标行
 * @param position - 落点
 */
export async function holdRowOver(page: Page, source: Locator, target: Locator, position: DropPosition): Promise<void> {
  await source.scrollIntoViewIfNeeded();
  await target.scrollIntoViewIfNeeded();
  const handle = await requireBox(source.locator(HANDLE_SELECTOR), '源行拖拽手柄');
  const targetBox = await requireBox(target, '目标行');

  const x = targetBox.x + targetBox.width / 2;
  const y = targetBox.y + targetBox.height * POSITION_RATIO[position];
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(x, y, { steps: MOVE_STEPS });
  await page.mouse.move(x + 1, y);
}

/**
 * 把源行拖到目标行的指定落点并松开。
 *
 * @param page - 页面
 * @param source - 被拖行
 * @param target - 目标行
 * @param position - 落点：`before` 目标行上方、`after` 下方、`into` 拖进目标行
 */
export async function dragRowTo(page: Page, source: Locator, target: Locator, position: DropPosition): Promise<void> {
  await holdRowOver(page, source, target, position);
  await page.mouse.up();
}
