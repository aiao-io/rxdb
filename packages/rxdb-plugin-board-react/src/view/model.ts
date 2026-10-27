import type { BoardData } from './use-board-data.js';
import type { CardModel } from './use-card-model.js';
import type { ColumnModel } from './use-column-model.js';
import type { DetailModel } from './use-detail-model.js';
import type { DialogModel } from './use-dialog-model.js';
import type { DragModel } from './use-drag-model.js';
import type { HeaderModel } from './use-header-model.js';
import type { PopoverModel } from './use-popover-model.js';
import type { SearchModel } from './use-search-model.js';
import type { ViewCore } from './use-view-core.js';

/** 看板视图模型：各区域的状态与动作（渲染读取，事件处理调用）。 */
export interface BoardViewModel {
  readonly core: ViewCore;
  readonly data: BoardData;
  readonly popover: PopoverModel;
  readonly detail: DetailModel;
  readonly dialog: DialogModel;
  readonly header: HeaderModel;
  readonly columns: ColumnModel;
  readonly cards: CardModel;
  readonly search: SearchModel;
  readonly drag: DragModel;
}

/** 取最新一帧的视图模型（区域之间互相调用经它延迟解析，避免构造顺序耦合）。 */
export type ModelGetter = () => BoardViewModel;

/** 触发事件：只用到触发器元素（弹层锚点与关闭后的焦点归还）。 */
export interface TriggerEvent {
  readonly currentTarget: EventTarget | null;
}

/** 触发器矩形（视口坐标）。 */
export const anchorOf = (event: TriggerEvent): DOMRect => (event.currentTarget as HTMLElement).getBoundingClientRect();
