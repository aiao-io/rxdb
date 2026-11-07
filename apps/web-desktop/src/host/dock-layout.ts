export type DockSlotKind = 'icon' | 'divider';
export interface DockSlot {
  kind: DockSlotKind;
  center: number;
  width: number;
  gap: number;
}
export interface DockGeometry {
  size: number;
  padding: number;
  width: number;
  availableWidth: number;
  slots: DockSlot[];
}
export interface DockPlacement {
  width: number;
  items: { x: number; center: number; scale: number; width: number }[];
}

/** 根据静止布局计算几何信息；动画期间不反向测量已经放大的图标。 */
export function measureDock(kinds: readonly DockSlotKind[], availableWidth: number): DockGeometry {
  const baseWidth =
    16 +
    kinds.reduce(
      (width, kind, index) =>
        width + (kind === 'icon' ? 54 : 16) + (kind === 'icon' && index < kinds.length - 1 ? 5 : 0),
      0
    );
  const ratio = Math.min(1, availableWidth / baseWidth);
  const padding = 8 * ratio;
  let x = padding;
  const slots = kinds.map((kind, index) => {
    const width = (kind === 'icon' ? 54 : 16) * ratio;
    const gap = kind === 'icon' && index < kinds.length - 1 ? 5 * ratio : 0;
    const slot = { kind, width, gap, center: x + width / 2 };
    x += width + gap;
    return slot;
  });
  return { size: 54 * ratio, padding, width: baseWidth * ratio, availableWidth, slots };
}

/** 余弦钟形衰减驱动邻近图标，并按视口剩余空间限制整体扩展。 */
export function dockTargets(geometry: DockGeometry, pointer: number | null): number[] {
  const scales = geometry.slots.map(slot => {
    if (pointer === null || slot.kind === 'divider') return 1;
    const distance = Math.abs(pointer - slot.center);
    const proximity = Math.max(0, 1 - distance / (geometry.size * 2.9));
    return 1 + 0.42 * (0.5 - 0.5 * Math.cos(Math.PI * proximity)) ** 0.86;
  });
  const expansion = scales.reduce((width, scale, index) => width + geometry.slots[index].width * (scale - 1), 0);
  const room = geometry.availableWidth - geometry.width;
  const amount = expansion > 0 ? Math.min(1, room / expansion) : 1;
  return scales.map(scale => 1 + (scale - 1) * amount);
}

/** 用经过时间平滑插值，使 60 Hz 和高刷新率屏幕保持相同的跟随速度。 */
export function smoothDock(current: readonly number[], target: readonly number[], elapsed: number): number[] {
  const blend = 1 - 0.62 ** (elapsed / (1000 / 60));
  return current.map((scale, index) =>
    Math.abs(target[index] - scale) <= 0.0007 ? target[index] : scale + (target[index] - scale) * blend
  );
}

/** 按当前可见宽度排布图标，维持底边对齐与固定间距。 */
export function placeDock(geometry: DockGeometry, scales: readonly number[]): DockPlacement {
  let x = geometry.padding;
  const items = geometry.slots.map((slot, index) => {
    const scale = scales[index];
    const width = slot.width * scale;
    const center = x + width / 2;
    const placement = { x: center - slot.width / 2, center, scale, width };
    x += width + slot.gap;
    return placement;
  });
  return { width: x + geometry.padding, items };
}
