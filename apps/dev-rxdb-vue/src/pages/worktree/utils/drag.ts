/**
 * @fileoverview 面板里所有「按住拖动调宽」的公共样板。
 *
 * @remarks
 * 左侧栏分隔条、工具栏分段分隔条、历史文件列表分隔条三处的拖拽逻辑完全同构
 * （pointerdown 起手 → move/up 挂 document，拖出组件也不断 → 宽度夹在 [min, max]），
 * 分写三份迟早一处改了另两处没改。宽度计算单独成纯函数，便于单测。
 */

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
  event: PointerEvent,
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
