import { OrbitError } from './errors.js';
import { isRecord } from './payload.js';
import type { OrbitDragRegion, OrbitRect, OrbitWindowState } from './window.js';

/*
 * 窗口协议与桌面能力协议共用的校验与拖动区跟踪（内部模块，不是公开入口）：
 * `@aiao/orbit/window`（逐方法的旧协议，已发布的应用在用）与 `@aiao/orbit/desktop`（统一信封）读同一套参数规则。
 */

/** 窗口标题的最大长度。 */
export const MAX_TITLE = 256;
/** 一次上报的拖动区（及每块拖动区的挖空）最多几项。 */
export const MAX_REGIONS = 64;
/** 宿主的外观平台取值。 */
export const PLATFORMS: readonly string[] = ['macos'];
/** 窗口外观取值。 */
export const FRAMES: readonly string[] = ['standard', 'transparent'];

const DRAG_REGION = '[data-orbit-drag-region]';
const NO_DRAG =
  'button,a[href],input,select,textarea,[contenteditable=""],[contenteditable="true"],[role="button"],[data-orbit-no-drag]';

export function invalid(message: string): OrbitError {
  return new OrbitError('INVALID_PAYLOAD', message);
}

export function readState(value: unknown): OrbitWindowState {
  if (!isRecord(value)) throw invalid('窗口状态必须是对象');
  const { platform, frame, decorations, focused, maximized } = value;
  const flags = [decorations, focused, maximized].every(flag => typeof flag === 'boolean');
  if (!PLATFORMS.includes(String(platform)) || !FRAMES.includes(String(frame)) || !flags)
    throw invalid('窗口状态字段无效');
  return Object.freeze({ platform, frame, decorations, focused, maximized } as OrbitWindowState);
}

export function readRect(value: unknown): OrbitRect {
  if (!isRecord(value)) throw invalid('拖动区必须是矩形');
  const { x, y, width, height } = value;
  const numbers = [x, y, width, height].every(item => typeof item === 'number' && Number.isFinite(item));
  if (!numbers || (width as number) < 0 || (height as number) < 0) throw invalid('拖动区的坐标与尺寸无效');
  return { x, y, width, height } as OrbitRect;
}

export function readRegions(value: unknown): OrbitDragRegion[] {
  if (!Array.isArray(value) || value.length > MAX_REGIONS) throw invalid(`拖动区必须是最多 ${MAX_REGIONS} 项的数组`);
  return value.map(item => {
    const holes = isRecord(item) ? item['holes'] : undefined;
    if (!Array.isArray(holes) || holes.length > MAX_REGIONS) throw invalid('拖动区的挖空必须是数组');
    return { ...readRect(item), holes: holes.map(readRect) };
  });
}

export function readTitle(value: unknown): string {
  if (typeof value !== 'string' || value.length > MAX_TITLE) throw invalid(`窗口标题必须是最多 ${MAX_TITLE} 个字符`);
  return value;
}

export function readBoolean(value: unknown): boolean {
  if (typeof value !== 'boolean') throw invalid('参数必须是布尔值');
  return value;
}

function rectOf(element: Element): OrbitRect {
  const { x, y, width, height } = element.getBoundingClientRect();
  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
}

function visible(rect: OrbitRect): boolean {
  return rect.width > 0 && rect.height > 0;
}

/** 收集 root 下的拖动区：带 `data-orbit-drag-region` 的元素，挖掉其中的可交互元素。 */
export function collectDragRegions(root: Document | Element): OrbitDragRegion[] {
  return [...root.querySelectorAll(DRAG_REGION)].flatMap(element => {
    const region = rectOf(element);
    if (!visible(region)) return [];
    const holes = [...element.querySelectorAll(NO_DRAG)].map(rectOf).filter(visible);
    return [{ ...region, holes }];
  });
}

/** 跟踪 root 下的拖动区，布局变化时调用 `report`；返回停止函数，停止时清空拖动区。 */
export function trackDragRegions(report: (regions: OrbitDragRegion[]) => void, root: Document | Element): () => void {
  const view = (root instanceof Document ? root : root.ownerDocument).defaultView;
  if (!view) throw new OrbitError('UNSUPPORTED', '拖动区只能在浏览器文档里跟踪');
  let frame = 0;
  let last = '';
  const flush = () => {
    frame = 0;
    const regions = collectDragRegions(root);
    const key = JSON.stringify(regions);
    if (key === last) return;
    last = key;
    report(regions);
  };
  const schedule = () => {
    frame ||= view.requestAnimationFrame(flush);
  };
  const resize = new ResizeObserver(schedule);
  const observe = () => {
    resize.disconnect();
    resize.observe(view.document.documentElement);
    for (const element of root.querySelectorAll(`${DRAG_REGION},${DRAG_REGION} *`)) resize.observe(element);
  };
  const mutations = new MutationObserver(() => {
    observe();
    schedule();
  });
  for (const element of root.querySelectorAll(DRAG_REGION))
    mutations.observe(element, { subtree: true, childList: true, attributes: true, characterData: true });
  observe();
  view.addEventListener('resize', schedule);
  schedule();
  return () => {
    view.cancelAnimationFrame(frame);
    resize.disconnect();
    mutations.disconnect();
    view.removeEventListener('resize', schedule);
    report([]);
  };
}
