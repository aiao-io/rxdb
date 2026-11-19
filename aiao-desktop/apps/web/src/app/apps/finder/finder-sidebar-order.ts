import { moveItemInArray } from '@angular/cdk/drag-drop';
import { Service, computed, inject, signal } from '@angular/core';

import { Preferences } from '../../data/preferences';
import { Toast } from '../../services/toast';
import { FinderSidebarGroup, SIDEBAR } from './finder-model';

const orderKey = (head: string): string => `finder:sidebar:${head}`;
const isPlaceOrder = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.every(name => typeof name === 'string');

function applyOrder(group: FinderSidebarGroup, order: readonly string[]): FinderSidebarGroup {
  const items = new Map(group.items.map(item => [item[0], item]));
  const ordered = [...new Set([...order, ...items.keys()])].map(name => items.get(name));
  return { ...group, items: ordered.filter(item => item !== undefined) };
}

/** 所有 Finder 窗口共用侧栏顺序，每组单独保存到本地偏好。 */
@Service({ autoProvided: false })
export class FinderSidebarOrder {
  private readonly preferences = inject(Preferences);
  private readonly toast = inject(Toast);
  private readonly pending = signal<ReadonlyMap<string, readonly string[]>>(new Map());

  readonly groups = computed(() =>
    SIDEBAR.map(group => {
      const key = orderKey(group.head);
      const order = this.pending().get(key) ?? this.preferences.get(key, isPlaceOrder);
      return order ? applyOrder(group, order) : group;
    })
  );

  /** 在原分组内移动快捷项。 */
  move(head: string, name: string, index: number): boolean {
    const group = this.groups().find(group => group.head === head);
    if (!group) return false;
    const order = group.items.map(([name]) => name);
    const from = order.indexOf(name);
    if (from < 0 || from === index || index < 0 || index >= order.length) return false;

    moveItemInArray(order, from, index);
    const key = orderKey(head);
    this.pending.update(pending => new Map(pending).set(key, order));
    void this.preferences.set(key, order).then(
      () => this.clearPending(key, order),
      () => {
        this.clearPending(key, order);
        this.toast.show('Couldn’t save the Finder sidebar order.');
      }
    );
    return true;
  }

  private clearPending(key: string, order: readonly string[]): void {
    const pending = this.pending();
    if (pending.get(key) !== order) return;
    const next = new Map(pending);
    next.delete(key);
    this.pending.set(next);
  }
}
