/**
 * 索引项组件
 *
 * 在索引面板中显示单个索引的编辑项，支持索引属性选择和唯一性配置。
 */
import { CdkDragHandle } from '@angular/cdk/drag-drop';
import { NgClass } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal
} from '@angular/core';
import { FormField, form } from '@angular/forms/signals';
import { ChevronRight, GripVertical, LucideAngularModule, Trash2, X } from 'lucide-angular';
import { toggleArrayItem } from '../../constants';
import { MODEL_DESIGNER_TRANSLATIONS } from '../../i18n/translations';
import type { DesignIndexChanges } from '../../interfaces';
import type { DesignIndex } from '../../models/index.js';

@Component({
  selector: 'lib-index-item',
  imports: [FormField, NgClass, CdkDragHandle, LucideAngularModule],
  templateUrl: './index-item.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class IndexItemComponent {
  readonly #formModel = linkedSignal(() => ({
    isUnique: this.index().isUnique,
    displayName: this.index().displayName ?? ''
  }));

  protected readonly ChevronRight = ChevronRight;
  protected readonly GripVertical = GripVertical;
  protected readonly Trash2 = Trash2;
  protected readonly X = X;
  protected readonly t = inject(MODEL_DESIGNER_TRANSLATIONS);

  readonly index = input.required<DesignIndex>();
  readonly availableProperties = input<{ id: string; name: string }[]>([]);
  readonly isDuplicate = input(false);
  readonly isEmpty = input(false);
  /** 详情区是否展开（由父级控制） */
  readonly expanded = input(false);

  readonly updated = output<DesignIndexChanges>();
  readonly deleted = output<void>();
  readonly expandToggled = output<void>();

  /** 属性搜索词（属性多时用于过滤候选列表） */
  readonly searchText = signal('');

  readonly filteredProperties = computed(() => {
    const q = this.searchText().trim().toLowerCase();
    const all = this.availableProperties();
    if (!q) return all;
    return all.filter(p => p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q));
  });

  readonly indexForm = form(this.#formModel);

  isPropertySelected(propId: string): boolean {
    return (this.index().propertyIds ?? []).includes(propId);
  }

  toggleProperty(propId: string) {
    const updated = toggleArrayItem(this.index().propertyIds ?? [], propId);
    this.updated.emit({ propertyIds: updated });
  }

  formatPropertyNames(): string {
    const ids = this.index().propertyIds ?? [];
    if (ids.length === 0) return this.t().indexPanel.noProperties;
    const propMap = new Map(this.availableProperties().map(p => [p.id, p.name]));
    return ids.map(id => propMap.get(id) ?? id).join(', ');
  }

  toggleDetails() {
    this.expandToggled.emit();
  }

  onSearchInput(event: Event) {
    this.searchText.set((event.target as HTMLInputElement).value);
  }

  /** Esc 清空搜索词，不冒泡关闭面板（keydown.escape 过滤下模板传入类型为 Event） */
  clearSearch(event: Event) {
    event.stopPropagation();
    this.searchText.set('');
  }

  emitFormChanges() {
    const m = this.#formModel();
    const idx = this.index();
    const changes: Partial<DesignIndexChanges> = {};
    if (m.isUnique !== idx.isUnique) changes.isUnique = m.isUnique;
    if ((m.displayName || null) !== (idx.displayName ?? null)) changes.displayName = m.displayName || null;
    if (Object.keys(changes).length > 0) this.updated.emit(changes);
  }
}
