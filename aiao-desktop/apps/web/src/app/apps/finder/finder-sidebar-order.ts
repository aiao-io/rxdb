import { moveItemInArray } from '@angular/cdk/drag-drop';
import { Service, computed, inject, signal } from '@angular/core';

import { Preferences } from '../../data/preferences';
import { Toast } from '../../services/toast';
import { FAVOURITES_GROUP, FinderSidebarGroup, SIDEBAR } from './finder-model';

const orderKey = (head: string): string => `finder:sidebar:${head}`;
const removedKey = (name: string): string => `${orderKey(FAVOURITES_GROUP)}:removed:${name}`;
const isPlaceOrder = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.every(name => typeof name === 'string');
const isRemoved = (value: unknown): value is true => value === true;
type SidebarPreference = readonly string[] | true;

function applyOrder(group: FinderSidebarGroup, order: readonly string[]): FinderSidebarGroup {
  const items = new Map(group.items.map(item => [item[0], item]));
  const ordered = [...new Set([...order, ...items.keys()])].map(name => items.get(name));
  return { ...group, items: ordered.filter(item => item !== undefined) };
}

/** 所有 Finder 窗口共用侧栏顺序和已移除的收藏快捷项。 */
@Service({ autoProvided: false })
export class FinderSidebarOrder {
  private readonly preferences = inject(Preferences);
  private readonly toast = inject(Toast);
  private readonly pending = signal<ReadonlyMap<string, SidebarPreference>>(new Map());

  readonly groups = computed(() =>
    SIDEBAR.map(group => {
      const order = this.get(orderKey(group.head), isPlaceOrder);
      const ordered = order ? applyOrder(group, order) : group;
      if (group.head !== FAVOURITES_GROUP) return ordered;
      return { ...ordered, items: ordered.items.filter(([name]) => !this.get(removedKey(name), isRemoved)) };
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
    this.persist(orderKey(head), order, 'error.finder.sidebarOrderSave');
    return true;
  }

  /** 只移除 Favourites 中的快捷项。 */
  removeFavourite(name: string): boolean {
    const group = this.groups().find(group => group.head === FAVOURITES_GROUP);
    if (!group?.items.some(([place]) => place === name)) return false;

    this.persist(removedKey(name), true, 'error.finder.favouriteRemove');
    return true;
  }

  private get<T extends SidebarPreference>(key: string, guard: (value: unknown) => value is T): T | undefined {
    const pending = this.pending().get(key);
    return guard(pending) ? pending : this.preferences.get(key, guard);
  }

  private persist(key: string, value: SidebarPreference, failureKey: string): void {
    this.pending.update(pending => new Map(pending).set(key, value));
    void this.preferences.set(key, value).then(
      () => this.clearPending(key, value),
      () => {
        this.clearPending(key, value);
        this.toast.show(failureKey);
      }
    );
  }

  private clearPending(key: string, value: SidebarPreference): void {
    const pending = this.pending();
    if (pending.get(key) !== value) return;
    const next = new Map(pending);
    next.delete(key);
    this.pending.set(next);
  }
}
