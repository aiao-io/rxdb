/**
 * 关系项组件
 *
 * 在属性面板中显示单个关系的编辑项，支持关系类型、目标实体、级联操作等配置。
 */
import { CdkDragHandle } from '@angular/cdk/drag-drop';
import { NgClass } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  output,
  viewChild
} from '@angular/core';
import { FormField, form, pattern } from '@angular/forms/signals';
import { ChevronRight, GripVertical, LucideAngularModule, Trash2, X } from 'lucide-angular';
import { CASCADE_ACTIONS, PROPERTY_COLUMN_NAME_PATTERN, RELATION_KIND_OPTIONS } from '../../constants';
import type { CascadeAction } from '../../constants/options';
import { RELATION_LABELS, type RelationKind } from '../../constants/relation';
import { MODEL_DESIGNER_TRANSLATIONS } from '../../i18n/translations';
import type { DesignRelationChanges } from '../../interfaces';
import type { DesignRelation } from '../../models/index.js';
import { buildTargetRelationsByEntity, targetRelationsOf as targetRelationsOfFn } from '../shared/entity-edit-utils';

@Component({
  selector: 'lib-relation-item',
  imports: [FormField, NgClass, CdkDragHandle, LucideAngularModule],
  templateUrl: './relation-item.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RelationItemComponent {
  readonly #model = linkedSignal(() => {
    const r = this.relation();
    return {
      name: r.name,
      displayName: r.displayName ?? '',
      relationKind: r.relationKind as string,
      mappedEntityId: r.mappedEntityId ?? '',
      columnName: r.columnName ?? '',
      mappedPropertyId: r.mappedPropertyId ?? '',
      onDeleteAction: (r.onDeleteAction ?? 'NO_ACTION') as string,
      onUpdateAction: (r.onUpdateAction ?? 'NO_ACTION') as string
    };
  });
  protected readonly ChevronRight = ChevronRight;
  protected readonly GripVertical = GripVertical;
  protected readonly Trash2 = Trash2;
  protected readonly X = X;
  protected readonly t = inject(MODEL_DESIGNER_TRANSLATIONS);
  protected readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');
  readonly relation = input.required<DesignRelation>();
  readonly entities = input<ReadonlyArray<{ id: string; name: string }>>([]);
  readonly allRelations = input<DesignRelation[]>([]);
  readonly targetRelationsByEntity = buildTargetRelationsByEntity(this.allRelations);

  readonly isInvalid = input(false);
  /** 校验错误 key 列表（`validation.*` 前缀的 i18n 路径），渲染为具体原因文案 */
  readonly errors = input<string[]>([]);
  /** 详情区是否展开（由父级控制） */
  readonly expanded = input(false);
  /** 挂载后自动聚焦并全选名称输入框（新增项场景） */
  readonly autoFocus = input(false);

  readonly updated = output<DesignRelationChanges>();
  readonly deleted = output<void>();
  readonly expandToggled = output<void>();
  /** 名称输入框已聚焦（通知父级清除 autoFocus，避免 tab 切换重建后重复抢焦点） */
  readonly focusHandled = output<void>();

  /** 校验错误原文（占位符替换后的本地化文案） */
  readonly errorMessages = computed(() => {
    const rel = this.relation();
    const target = this.entities().find(e => e.id === rel.mappedEntityId);
    const messages: string[] = [];
    for (const key of this.errors()) {
      const template = this.#validationText(key);
      if (!template) continue;
      messages.push(
        template
          .replace('{id}', rel.mappedEntityId ?? '')
          .replace('{name}', rel.name)
          .replace('{kind}', rel.relationKind)
          .replace('{target}', target?.name ?? rel.mappedEntityId ?? '')
      );
    }
    return messages;
  });

  readonly summaryText = computed(() => {
    const m = this.#model();
    const target = this.entities().find(e => e.id === m.mappedEntityId)?.name;
    return [this.kindLabel(m.relationKind), target].filter(Boolean).join(' → ');
  });

  readonly relationKinds = RELATION_KIND_OPTIONS;
  readonly cascadeActions = CASCADE_ACTIONS;

  readonly relationForm = form(this.#model, s => {
    pattern(s.columnName, PROPERTY_COLUMN_NAME_PATTERN);
  });

  readonly targetRelations = computed(() =>
    targetRelationsOfFn(this.targetRelationsByEntity, this.#model().mappedEntityId)
  );

  readonly isManyToMany = computed(() => this.#model().relationKind === 'MANY_TO_MANY');

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

  toggleDetails() {
    this.expandToggled.emit();
  }

  /** 关系类型显示标签（1:1 / 1:N / N:1 / N:N），未知类型回退原文 */
  kindLabel(kind: string): string {
    return RELATION_LABELS[kind as RelationKind] ?? kind;
  }

  emitChanges() {
    const m = this.#model();
    const r = this.relation();
    const changes: Partial<DesignRelationChanges> = {};

    if (m.name !== r.name) changes.name = m.name;
    if ((m.displayName || null) !== (r.displayName ?? null)) changes.displayName = m.displayName || null;
    if (m.relationKind !== r.relationKind) changes.relationKind = m.relationKind as RelationKind;
    if ((m.mappedEntityId || null) !== (r.mappedEntityId ?? null)) changes.mappedEntityId = m.mappedEntityId || null;
    if ((m.columnName || null) !== (r.columnName ?? null) && !this.relationForm.columnName().invalid()) {
      changes.columnName = m.columnName || null;
    }
    if ((m.mappedPropertyId || null) !== (r.mappedPropertyId ?? null)) {
      changes.mappedPropertyId = m.mappedPropertyId || null;
    }
    if (m.onDeleteAction !== (r.onDeleteAction ?? 'NO_ACTION')) {
      changes.onDeleteAction = m.onDeleteAction as CascadeAction;
    }
    if (m.onUpdateAction !== (r.onUpdateAction ?? 'NO_ACTION')) {
      changes.onUpdateAction = m.onUpdateAction as CascadeAction;
    }

    if (Object.keys(changes).length > 0) this.updated.emit(changes);
  }

  /** 把 `validation.*` 错误 key 转成本地化文案模板 */
  #validationText(key: string): string | undefined {
    if (!key.startsWith('validation.')) return undefined;
    const name = key.slice('validation.'.length);
    return (this.t().validation as unknown as Record<string, string | undefined>)[name];
  }
}
