/**
 * @fileoverview 面板里所有「按住拖动调宽」的公共样板（Angular 参考实现的原样移植）。
 *
 * @remarks
 * 左侧栏分隔条、工具栏分段分隔条、历史文件列表分隔条三处的拖拽逻辑完全同构
 * （pointerdown 起手 → move/up 挂 document，拖出组件也不断 → 宽度夹在 [min, max]），
 * 分写三份迟早一处改了另两处没改。宽度计算单独成纯函数，便于单测。
 *
 * 与 Angular 参考实现的唯一差异：`startDragResize` 的入参收 `DragResizeEvent`
 * （只读 `preventDefault` 与 `clientX`）而不是原生 `PointerEvent`——React 的
 * 合成 `React.PointerEvent` 结构上满足这两个成员，收窄签名让两端的调用点
 * 都不需要先拆开合成事件。
 */

/** 一次拖拽起手事件的最小形状：React 合成事件与原生 PointerEvent 都满足。 */
export interface DragResizeEvent {
  readonly preventDefault: () => void;
  readonly clientX: number;
}

/** 拖拽调宽的纯计算：起点宽度 + 位移，夹在 [min, max]。 */
export const clampDragWidth = (startWidth: number, deltaX: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, startWidth + deltaX));

/**
 * 按住拖动调宽：pointerdown 起手，move/up 挂 document，拖出组件也不断。
 *
 * @param event - 分隔条上的 pointerdown 事件
 * @param options.getWidth - 按下那一刻的当前宽度（拖拽全程用起点值，不逐帧读，避免抖动）
 * @param options.setWidth - 每个 move 把新宽度写回
 * @param options.min / options.max - 宽度夹取范围
 */
export const startDragResize = (
  event: DragResizeEvent,
  options: {
    readonly getWidth: () => number;
    readonly setWidth: (width: number) => void;
    readonly min: number;
    readonly max: number;
  }
): void => {
  event.preventDefault();
  const startX = event.clientX;
  const startWidth = options.getWidth();
  const onMove = (move: PointerEvent) => {
    options.setWidth(clampDragWidth(startWidth, move.clientX - startX, options.min, options.max));
  };
  const onUp = () => {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
  };
  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
};
