import type { VirtualItem } from '@tanstack/vue-virtual';

export interface PairedVirtualRow<T> {
  item: T;
  virtualItem: VirtualItem;
}

export function pairVirtualRows<T>(items: readonly T[], virtualItems: readonly VirtualItem[]): PairedVirtualRow<T>[] {
  return virtualItems.flatMap(virtualItem => {
    const item = items.at(virtualItem.index);
    return item === undefined ? [] : [{ item, virtualItem }];
  });
}
