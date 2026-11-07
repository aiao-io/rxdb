/**
 * 属性项组件
 *
 * 在属性面板中显示单个属性的编辑项，支持属性类型、默认值、约束条件等配置。
 * 支持 keyValue 类型的嵌套子属性。
 */
import type { DesignProperty } from '../../models/index.js';
import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList } from '@angular/cdk/drag-drop';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  viewChild
} from '@angular/core';
import { form, FormField, pattern } from '@angular/forms/signals';
import type { LucideIconData } from 'lucide-angular';
import {
  Binary,
  Braces,
  Calendar,
  ChevronRight,
  Code,
  GripVertical,
  Hash,
  KeyRound,
  List,
  ListOrdered,
  LucideAngularModule,
  ToggleLeft,
  Trash2,
  Type,
  X
} from 'lucide-angular';
import {
  KEYVALUE_SUB_TYPE_LABELS,
  KEYVALUE_SUB_TYPES,
  PROPERTY_COLUMN_NAME_PATTERN,
  PROPERTY_NAME_PATTERN,
  PROPERTY_TYPE_LABELS,
  PROPERTY_TYPES,
  type PropertyType
} from '../../constants';
import { MODEL_DESIGNER_TRANSLATIONS } from '../../i18n/translations';
import type { DesignPropertyChanges } from '../../interfaces';

interface TypeOption {
  readonly value: PropertyType;
  readonly label: string;
  readonly icon: LucideIconData;
  readonly color: string;
}

/** 类型图标和颜色静态元数据 */
const PROPERTY_TYPE_META: Record<string, { icon: LucideIconData; color: string }> = {
  uuid: { icon: KeyRound, color: '#8b5cf6' },
  string: { icon: Type, color: '#3b82f6' },
  number: { icon: Hash, color: '#10b981' },
  integer: { icon: Binary, color: '#059669' },
  boolean: { icon: ToggleLeft, color: '#f59e0b' },
  date: { icon: Calendar, color: '#ec4899' },
  stringArray: { icon: List, color: '#06b6d4' },
  numberArray: { icon: ListOrdered, color: '#14b8a6' },
  keyValue: { icon: Braces, color: '#6366f1' },
  json: { icon: Code, color: '#64748b' },
  enum: { icon: List, color: '#7c3aed' }
};

@Component({
  selector: 'lib-property-item',
  imports: [FormField, LucideAngularModule, CdkDropList, CdkDrag, CdkDragHandle],
  templateUrl: './property-item.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .cdk-drag-animating {
      transition: transform 250ms cubic-bezier(0, 0, 0.2, 1);
    }
    .cdk-drop-list-dragging .cdk-drag:not(.cdk-drag-placeholder) {
      transition: transform 250ms cubic-bezier(0, 0, 0.2, 1);
    }
    .cdk-drag-placeholder {
      opacity: 0.4;
    }
  `
})
export class PropertyItemComponent {
  readonly #model = linkedSignal(() => {
    const p = this.property();
    return {
      name: p.name,
      propertyType: p.propertyType,
      isNullable: p.isNullable,
      isRequired: p.isRequired,
      isUnique: p.isUnique,
      isReadonly: p.isReadonly,
      isSortable: p.isSortable,
      columnName: p.columnName ?? '',
      displayName: p.displayName ?? '',
      defaultValue: p.defaultValue ?? '',
      enumValues: (p.enumValues ?? []).join(', ')
    };
  });

  /** 键盘焦点高亮的类型值（未 Enter 选择前不提交） */
  readonly #highlightedType = signal<string | null>(null);
  protected readonly highlighted = computed(() => this.#highlightedType());

  protected readonly ChevronRight = ChevronRight;
  protected readonly GripVertical = GripVertical;
  protected readonly Trash2 = Trash2;
  protected readonly X = X;
  protected readonly t = inject(MODEL_DESIGNER_TRANSLATIONS);
  protected readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');
  readonly property = input.required<DesignProperty>();
  /** keyValue 子属性列表 */
  readonly childProperties = input<DesignProperty[]>([]);
  /** 是否为子属性（限制可选类型） */
  readonly isChild = input(false);
  /** 同级属性名列表（用于同名校验） */
  readonly siblingNames = input<string[]>([]);
  /** 详情区是否展开（由父级控制，默认折叠） */
  readonly expanded = input(false);
  /** 挂载后自动聚焦并全选名称输入框（新增项场景） */
  readonly autoFocus = input(false);
  /** 新增 keyValue 子属性后待聚焦的 id（透传给子级 property-item） */
  readonly focusChildId = input<string | null>(null);
  readonly updated = output<DesignPropertyChanges>();
  readonly deleted = output<void>();
  /** 名称输入框已聚焦（通知父级清除 autoFocus，避免 tab 切换重建后重复抢焦点） */
  readonly focusHandled = output<void>();
  /** 子属性名称输入框已聚焦（冒泡给面板清除 focusChildId） */
  readonly focusChildHandled = output<void>();
  /** 添加子属性（仅 keyValue 类型） */
  readonly childAdded = output<void>();
  /** 子属性变更 */
  readonly childUpdated = output<{ id: string; changes: DesignPropertyChanges }>();
  /** 子属性删除 */
  readonly childDeleted = output<string>();
  /** 子属性拖动排序 */
  readonly childDropped = output<CdkDragDrop<DesignProperty[]>>();
  /** 详情展开切换（父级收拢一次只展开一项） */
  readonly expandToggled = output<void>();

  /** keyValue 子属性区域折叠状态 */
  readonly childrenCollapsed = signal(false);
  /** 类型下拉框展开状态 */
  readonly typeSelectOpen = signal(false);

  /** 类型选项（含图标+本地化名） */
  readonly propertyTypeOptions = computed<TypeOption[]>(() => {
    const labels = this.t().propertyTypes ?? {};
    return PROPERTY_TYPES.map(v => ({
      value: v,
      label: labels[v] ?? PROPERTY_TYPE_LABELS[v] ?? v,
      ...(PROPERTY_TYPE_META[v] ?? { icon: Type, color: '#888' })
    }));
  });

  readonly keyValueSubTypeOptions = computed<TypeOption[]>(() => {
    const labels = this.t().propertyTypes ?? {};
    return KEYVALUE_SUB_TYPES.map(v => ({
      value: v,
      label: labels[v] ?? KEYVALUE_SUB_TYPE_LABELS[v] ?? v,
      ...(PROPERTY_TYPE_META[v] ?? { icon: Type, color: '#888' })
    }));
  });

  /** 当前类型元数据（图标、颜色、标签） */
  readonly currentTypeMeta = computed(
    () =>
      (this.isChild() ? this.keyValueSubTypeOptions() : this.propertyTypeOptions()).find(
        o => o.value === this.#model().propertyType
      ) ?? this.propertyTypeOptions()[0]
  );

  /** 子属性名列表（用于子项同名校验） */
  readonly childPropertyNames = computed(() => this.childProperties().map(c => c.name));

  /** 当前属性名是否在同级中重复（排除自身原名） */
  readonly isNameDuplicate = computed(() => {
    const currentName = this.#model().name;
    if (!currentName) return false;
    const originalName = this.property().name;
    // 名字没变且只有自己在列表中 → 不重复
    if (currentName === originalName) return false;
    return this.siblingNames().includes(currentName);
  });

  /** 重复名称的错误文案（子属性与顶层属性用不同 key） */
  readonly nameDuplicateError = computed(() =>
    this.isChild() ?
      this.t().validation.childPropertyNameDuplicate
    : this.t().validation.propertyNameAlreadyExists.replace('{name}', this.#model().name)
  );

  /** 折叠态 flag 摘要（仅展示为 true 的约束） */
  readonly flagSummary = computed(() => {
    const m = this.#model();
    const labels = this.t().entityPanel;
    const flags: string[] = [];
    if (m.isRequired) flags.push(labels.required);
    if (m.isNullable) flags.push(labels.nullable);
    if (!this.isChild()) {
      if (m.isUnique) flags.push(labels.unique);
      if (m.isReadonly) flags.push(labels.readonly);
      if (m.isSortable) flags.push(labels.sortable);
    }
    return flags;
  });

  readonly propertyForm = form(this.#model, s => {
    pattern(s.name, PROPERTY_NAME_PATTERN);
    pattern(s.columnName, PROPERTY_COLUMN_NAME_PATTERN);
  });

  constructor() {
    effect(() => {
      if (!this.autoFocus()) return;
      const el = this.nameInput();
      if (!el) return;
      el.nativeElement.focus();
      // FormField 的值在下一轮 CD 才写入 DOM，rAF 后再全选才能选中完整默认名
      requestAnimationFrame(() => el.nativeElement.select());
      this.focusHandled.emit();
    });
  }

  toggleChildrenCollapsed(): void {
    this.childrenCollapsed.update(v => !v);
  }

  toggleTypeSelect(): void {
    this.typeSelectOpen.update(v => !v);
    if (!this.typeSelectOpen()) this.#highlightedType.set(null);
  }

  closeTypeSelect(): void {
    this.typeSelectOpen.set(false);
    this.#highlightedType.set(null);
  }

  /** combobox 键盘打开下拉 */
  onTypeTriggerKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const opts = this.isChild() ? this.keyValueSubTypeOptions() : this.propertyTypeOptions();
      const currentIdx = opts.findIndex(o => o.value === this.#model().propertyType);
      if (event.key === 'ArrowDown') {
        this.#highlightedType.set(opts[(currentIdx + 1) % opts.length].value);
      } else {
        this.#highlightedType.set(opts[(currentIdx - 1 + opts.length) % opts.length].value);
      }
      if (!this.typeSelectOpen()) this.typeSelectOpen.set(true);
      return;
    }
    if (event.key === 'Escape') {
      event.stopPropagation();
      this.typeSelectOpen.set(false);
    }
  }

  /** listbox 键盘导航：箭头高亮，Enter 提交，Esc 关闭 */
  onTypeListKeydown(event: KeyboardEvent): void {
    const opts = this.isChild() ? this.keyValueSubTypeOptions() : this.propertyTypeOptions();
    const highlighted = this.#highlightedType();
    const currentIdx =
      highlighted ?
        opts.findIndex(o => o.value === highlighted)
      : opts.findIndex(o => o.value === this.#model().propertyType);
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.#highlightedType.set(opts[(currentIdx + 1) % opts.length].value);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.#highlightedType.set(opts[(currentIdx - 1 + opts.length) % opts.length].value);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const target = this.#highlightedType();
      if (target) this.setPropertyType(target as PropertyType);
      this.typeSelectOpen.set(false);
      return;
    }
    if (event.key === 'Escape') {
      event.stopPropagation();
      this.typeSelectOpen.set(false);
    }
  }

  toggleDetails(): void {
    this.expandToggled.emit();
  }

  /** 选择属性类型并触发变更 */
  setPropertyType(value: PropertyType): void {
    this.#model.update(m => ({ ...m, propertyType: value }));
    this.typeSelectOpen.set(false);
    this.#highlightedType.set(null);
    this.emitChanges();
  }

  emitChanges() {
    const m = this.#model();
    const p = this.property();
    const changes: Partial<DesignPropertyChanges> = {};

    if (m.name !== p.name && !this.propertyForm.name().invalid() && !this.isNameDuplicate()) changes.name = m.name;
    if (m.propertyType !== p.propertyType) changes.propertyType = m.propertyType;
    if (m.isNullable !== p.isNullable) changes.isNullable = m.isNullable;
    if (m.isRequired !== p.isRequired) changes.isRequired = m.isRequired;
    if (m.isUnique !== p.isUnique) changes.isUnique = m.isUnique;
    if (m.isReadonly !== p.isReadonly) changes.isReadonly = m.isReadonly;
    if (m.isSortable !== p.isSortable) changes.isSortable = m.isSortable;
    if ((m.columnName || null) !== (p.columnName ?? null) && !this.propertyForm.columnName().invalid()) {
      changes.columnName = m.columnName || null;
    }
    if ((m.displayName || null) !== (p.displayName ?? null)) changes.displayName = m.displayName || null;
    if ((m.defaultValue || null) !== (p.defaultValue ?? null)) changes.defaultValue = m.defaultValue || null;

    if (m.propertyType === 'enum') {
      const newVals = m.enumValues
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
      const oldVals = p.enumValues ?? [];
      if (JSON.stringify(newVals) !== JSON.stringify(oldVals)) {
        changes.enumValues = newVals.length > 0 ? [...new Set(newVals)] : null;
      }
    }

    if (Object.keys(changes).length > 0) this.updated.emit(changes);
  }
}
