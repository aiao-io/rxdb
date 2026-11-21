/** 触屏长按：粗指针按住超过阈值且未明显移动时触发一次回调，并吞掉随后的 click 防止误触发打开动作。 */
export interface WorkbenchLongPressOptions {
  readonly thresholdMs?: number;
  readonly moveTolerance?: number;
  onLongPress(event: PointerEvent): void;
}

export function attachWorkbenchLongPress(element: HTMLElement, options: WorkbenchLongPressOptions): () => void {
  const threshold = options.thresholdMs ?? 500;
  const tolerance = options.moveTolerance ?? 10;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let startX = 0;
  let startY = 0;
  let pointerId: number | null = null;
  let pressed = false;

  const cancel = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    pointerId = null;
  };
  const onPointerDown = (event: PointerEvent): void => {
    if (event.pointerType === 'mouse' || !event.isPrimary || event.button !== 0) return;
    cancel();
    startX = event.clientX;
    startY = event.clientY;
    pointerId = event.pointerId;
    timer = setTimeout(() => {
      timer = null;
      pointerId = null;
      pressed = true;
      options.onLongPress(event);
    }, threshold);
  };
  const onPointerMove = (event: PointerEvent): void => {
    if (pointerId === null || timer === null) return;
    if (Math.hypot(event.clientX - startX, event.clientY - startY) > tolerance) cancel();
  };
  const onPointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== pointerId && !pressed) return;
    cancel();
    // 已触发长按时吞掉随后的 click；手指移开没有 click 时由下一轮事件循环清理标记
    if (pressed) setTimeout(() => (pressed = false), 0);
  };
  const onClickCapture = (event: Event): void => {
    if (!pressed) return;
    pressed = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  element.addEventListener('pointerdown', onPointerDown);
  element.addEventListener('pointermove', onPointerMove);
  element.addEventListener('pointerup', onPointerUp);
  element.addEventListener('pointercancel', cancel);
  element.addEventListener('click', onClickCapture, true);
  return () => {
    cancel();
    element.removeEventListener('pointerdown', onPointerDown);
    element.removeEventListener('pointermove', onPointerMove);
    element.removeEventListener('pointerup', onPointerUp);
    element.removeEventListener('pointercancel', cancel);
    element.removeEventListener('click', onClickCapture, true);
  };
}
