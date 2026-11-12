/**
 * ER 实体节点组件
 * 用于在画布上显示实体的卡片式组件
 * 展示实体名称、属性列表和关系列表
 */
import { NgClass } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type { LucideIconData } from 'lucide-angular';
import {
  Binary,
  Braces,
  Calendar,
  Code,
  Hash,
  Key,
  KeyRound,
  Link,
  List,
  ListOrdered,
  LucideAngularModule,
  ShieldCheck,
  ToggleLeft,
  Type
} from 'lucide-angular';
import { PROPERTY_TYPE_LABELS } from '../../constants';
import { MODEL_DESIGNER_TRANSLATIONS } from '../../i18n/translations';
import type { EntityNodeData, EntityNodeField } from '../../interfaces/designer.interface';

/** 类型 → 图标映射 */
const TYPE_ICONS: Record<string, LucideIconData> = {
  uuid: KeyRound,
  string: Type,
  number: Hash,
  integer: Binary,
  boolean: ToggleLeft,
  date: Calendar,
  stringArray: List,
  numberArray: ListOrdered,
  keyValue: Braces,
  json: Code
};

/** 类型 → 图标颜色映射 */
const TYPE_COLORS: Record<string, string> = {
  uuid: '#8b5cf6',
  string: '#3b82f6',
  number: '#10b981',
  integer: '#059669',
  boolean: '#f59e0b',
  date: '#ec4899',
  stringArray: '#06b6d4',
  numberArray: '#14b8a6',
  keyValue: '#6366f1',
  json: '#64748b'
};

@Component({
  selector: 'lib-er-entity-node',
  imports: [NgClass, LucideAngularModule],
  templateUrl: './er-entity-node.component.html',
  styleUrl: './er-entity-node.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ErEntityNodeComponent {
  readonly #t = inject(MODEL_DESIGNER_TRANSLATIONS);

  protected readonly Key = Key;
  protected readonly Link = Link;
  protected readonly ShieldCheck = ShieldCheck;

  readonly data = input<EntityNodeData>();

  readonly propertyFields = computed<EntityNodeField[]>(
    () => this.data()?.fields?.filter(f => f.category !== 'relation') ?? []
  );

  readonly relationFields = computed<EntityNodeField[]>(
    () => this.data()?.fields?.filter(f => f.category === 'relation') ?? []
  );

  typeLabel(type: string): string {
    return this.#t().propertyTypes?.[type] ?? PROPERTY_TYPE_LABELS[type] ?? type;
  }

  typeIcon(type: string): LucideIconData | null {
    return TYPE_ICONS[type] ?? null;
  }

  typeColor(type: string): string {
    return TYPE_COLORS[type] ?? '#888888';
  }
}
