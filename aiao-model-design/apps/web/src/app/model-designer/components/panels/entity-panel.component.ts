import { CdkDrag, CdkDragDrop, CdkDropList } from '@angular/cdk/drag-drop';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  viewChild,
  type WritableSignal
} from '@angular/core';
import { FormField, form, pattern } from '@angular/forms/signals';
import { ChevronRight, KeyRound, Link2, List, LucideAngularModule, X } from 'lucide-angular';
import {
  ENTITY_NAME_PATTERN,
  EXTENDS_OPTIONS,
  TABLE_NAME_PATTERN,
  generateUniqueName,
  getInheritedProperties,
  getRepositoryType,
  type ExtendsOption,
  type InheritedPropertyDef
} from '../../constants';
import { RELATION_KINDS } from '../../constants/relation';
import { MODEL_DESIGNER_TRANSLATIONS } from '../../i18n/translations';
import type {
  DesignEntityChanges,
  DesignIndexChanges,
  DesignPropertyChanges,
  DesignRelationChanges
} from '../../interfaces';
import type { DesignEntity, DesignIndex, DesignProperty, DesignRelation } from '../../models/index.js';
import { sortOrderBetween } from '../../services/entity-utils';
import {
  buildCustomProperties,
  buildInheritedProperties,
  buildInheritedRelations,
  snapshotEntity
} from '../shared/entity-edit-utils';
import { IndexItemComponent } from './index-item.component';
import { PropertyItemComponent } from './property-item.component';
import { RelationPanelComponent } from './relation-panel.component';

type Tab = 'properties' | 'relations' | 'indexes';

/**
 * 实体面板组件
 *
 * 显示选中实体的详细信息，包括基本信息、属性、关系和索引。
 * 支持编辑实体名称、表名、命名空间，选择基类等操作。
 */
@Component({
  selector: 'lib-entity-panel',
  imports: [
    FormField,
    RelationPanelComponent,
    PropertyItemComponent,
    IndexItemComponent,
    CdkDropList,
    CdkDrag,
    LucideAngularModule
  ],
  templateUrl: './entity-panel.component.html',
  styleUrl: './entity-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EntityPanelComponent {
  readonly #destroyRef = inject(DestroyRef);
  #debounceTimer: ReturnType<typeof setTimeout> | null = null;
  /** 添加后等待新 id 出现的标记，防止 undo/redo 等其它来源误触发聚焦 */
  readonly #expectingProperty = signal(false);
  readonly #expectingRelation = signal(false);
  readonly #expectingIndex = signal(false);
  readonly #knownPropertyIds = signal<ReadonlySet<string>>(new Set());
  readonly #knownRelationIds = signal<ReadonlySet<string>>(new Set());
  readonly #knownIndexIds = signal<ReadonlySet<string>>(new Set());
  readonly #knownChildIds = signal<ReadonlySet<string>>(new Set());
  readonly #expectingChildParent = signal<string | null>(null);
  readonly #entityModel = linkedSignal(() => {
    const ent = this.entity();
    return {
      name: ent?.name ?? '',
      displayName: ent?.displayName ?? '',
      tableName: ent?.tableName ?? '',
      extendsBase: ent?.extendsBase ?? 'EntityBase',
      entityNamespace: ent?.entityNamespace ?? ''
    };
  });

  protected readonly ChevronRight = ChevronRight;
  protected readonly X = X;
  protected readonly KeyRound = KeyRound;
  protected readonly Link2 = Link2;
  protected readonly List = List;
  protected readonly t = inject(MODEL_DESIGNER_TRANSLATIONS);
  protected readonly tabBody = viewChild<ElementRef<HTMLElement>>('tabBody');
  readonly entity = input<DesignEntity | null>(null);
  readonly properties = input<DesignProperty[]>([]);
  readonly childPropertiesMap = input<Map<string, DesignProperty[]>>(new Map());
  readonly relations = input<DesignRelation[]>([]);
  readonly invalidRelationIds = input<ReadonlySet<string>>(new Set());
  /** 关系校验错误：relationId → 错误 key 列表（key 为 `validation.*` 前缀的 i18n 路径） */
  readonly relationErrors = input<ReadonlyMap<string, string[]>>(new Map());
  readonly allRelations = input<DesignRelation[]>([]);
  readonly indexes = input<DesignIndex[]>([]);
  readonly entities = input<ReadonlyArray<{ id: string; name: string }>>([]);

  readonly entityUpdated = output<DesignEntityChanges>();
  readonly entityDeleted = output<string>();
  readonly propertyAdded = output<{ name: string; type: string }>();
  readonly propertyUpdated = output<{ id: string; changes: DesignPropertyChanges }>();
  readonly propertyDeleted = output<string>();
  readonly childPropertyAdded = output<{ parentPropertyId: string; name: string; type: string }>();
  readonly childPropertyUpdated = output<{ id: string; changes: DesignPropertyChanges }>();
  readonly childPropertyDeleted = output<string>();
  readonly relationAdded = output<{ name: string; kind: string; targetEntity: string }>();
  readonly relationUpdated = output<{ id: string; changes: DesignRelationChanges }>();
  readonly relationDeleted = output<string>();
  readonly indexAdded = output<{ propertyIds: string[]; isUnique: boolean }>();
  readonly indexUpdated = output<{ id: string; changes: DesignIndexChanges }>();
  readonly indexDeleted = output<string>();
  readonly indexesDeleteBatch = output<string[]>();
  readonly closed = output<void>();

  readonly activeTab = signal<Tab>('properties');
  /** 每个继承来源独立的展开状态（默认空 = 全部折叠） */
  readonly expandedGroups = signal<ReadonlySet<string>>(new Set());
  /** 实体基础信息默认折叠，优先把空间留给属性/关系/索引编辑 */
  readonly metaExpanded = signal(false);
  /** 当前展开的属性/关系/索引项（一次只展开一项，降低 320px 面板噪音） */
  readonly expandedItemId = signal<string | null>(null);
  /** 新增属性后待聚焦的 id（子组件聚焦完成后经 focusHandled 清空） */
  readonly focusPropertyId = signal<string | null>(null);
  /** 新增关系后待聚焦的 id */
  readonly focusRelationId = signal<string | null>(null);
  /** 新增 keyValue 子属性后待聚焦的 id */
  readonly focusChildPropertyId = signal<string | null>(null);
  readonly extendsOptions = EXTENDS_OPTIONS;

  readonly propertyCount = computed(() => this.inheritedProperties().length + this.customProperties().length);
  readonly relationCount = computed(() => this.inheritedRelations().length + this.relations().length);
  readonly canAddIndex = computed(() => this.allPropertiesForIndex().length > 0);
  readonly metaSummary = computed(() => {
    const m = this.#entityModel();
    const parts = [m.extendsBase || 'EntityBase'];
    if (m.tableName) parts.push(m.tableName);
    if (m.entityNamespace) parts.push(m.entityNamespace);
    return parts.join(' · ');
  });

  readonly propertyNamesList = computed(() => this.properties().map(p => p.name));

  readonly propertiesList = computed(() => this.properties().map(p => ({ id: p.id, name: p.name })));

  readonly entityForm = form(this.#entityModel, s => {
    pattern(s.name, ENTITY_NAME_PATTERN);
    pattern(s.tableName, TABLE_NAME_PATTERN);
  });

  readonly currentExtendsBase = computed(() => (this.#entityModel().extendsBase || 'EntityBase') as ExtendsOption);

  readonly inheritedProperties = buildInheritedProperties(this.currentExtendsBase);

  readonly inheritedRelations = buildInheritedRelations(this.currentExtendsBase);

  readonly inheritedPropertyGroups = computed(() => {
    const map = new Map<string, InheritedPropertyDef[]>();
    for (const prop of this.inheritedProperties()) {
      const list = map.get(prop.source);
      if (list) list.push(prop);
      else map.set(prop.source, [prop]);
    }
    return [...map.entries()].map(([source, properties]) => ({ source, properties }));
  });

  readonly customProperties = buildCustomProperties(this.properties);

  /** 索引快照 — undo/redo 时保证新引用，驱动 lib-index-item 的 linkedSignal 重置 */
  readonly indexSnapshots = computed(() => this.indexes().map(snapshotEntity));

  /** 检测属性组合重复的索引 ID 集合（忽略顺序） */
  readonly duplicateIndexIds = computed(() => {
    const indexes = this.indexes();
    const seen = new Map<string, string>();
    const duplicates = new Set<string>();
    for (const idx of indexes) {
      const key = [...(idx.propertyIds ?? [])].sort().join(',');
      if (!key) continue;
      const existing = seen.get(key);
      if (existing) {
        duplicates.add(existing);
        duplicates.add(idx.id);
      } else {
        seen.set(key, idx.id);
      }
    }
    return duplicates;
  });

  /** 属性为空的索引 ID 集合 */
  readonly emptyIndexIds = computed(() => {
    const ids = new Set<string>();
    for (const idx of this.indexes()) {
      if ((idx.propertyIds ?? []).length === 0) ids.add(idx.id);
    }
    return ids;
  });

  /** 索引可选属性：继承属性（仅 property 类型）+ 自定义属性 */
  readonly allPropertiesForIndex = computed(() => [
    ...this.inheritedProperties()
      .filter((p): p is InheritedPropertyDef & { category: 'property' } => p.category === 'property')
      .map(p => ({ id: p.name, name: p.displayName })),
    ...this.propertiesList()
  ]);

  constructor() {
    this.#destroyRef.onDestroy(() => {
      if (this.#debounceTimer) clearTimeout(this.#debounceTimer);
    });
    effect(() => {
      if (!this.#expectingProperty()) return;
      const id = this.#captureNewId(this.customProperties(), this.#knownPropertyIds);
      if (!id) return;
      this.#expectingProperty.set(false);
      this.focusPropertyId.set(id);
      requestAnimationFrame(() => this.#scrollTabBodyToBottom());
    });
    effect(() => {
      if (!this.#expectingRelation()) return;
      const id = this.#captureNewId(this.relations(), this.#knownRelationIds);
      if (!id) return;
      this.#expectingRelation.set(false);
      this.focusRelationId.set(id);
      requestAnimationFrame(() => this.#scrollTabBodyToBottom());
    });
    effect(() => {
      if (!this.#expectingIndex()) return;
      const id = this.#captureNewId(this.indexSnapshots(), this.#knownIndexIds);
      if (!id) return;
      this.#expectingIndex.set(false);
      this.expandedItemId.set(id);
      requestAnimationFrame(() => this.#scrollTabBodyToBottom());
    });
    effect(() => {
      const parentId = this.#expectingChildParent();
      if (!parentId) return;
      const children = this.childPropertiesMap().get(parentId) ?? [];
      const id = this.#captureNewId(children, this.#knownChildIds);
      if (!id) return;
      this.#expectingChildParent.set(null);
      this.focusChildPropertyId.set(id);
      requestAnimationFrame(() => this.#scrollTabBodyToBottom());
    });
  }

  emitEntityChanges() {
    const m = this.#entityModel();
    const ent = this.entity();
    if (!ent) return;

    const changes: Partial<DesignEntityChanges> = {};

    if (m.name !== ent.name && !this.entityForm.name().invalid()) changes.name = m.name;
    if ((m.displayName || null) !== (ent.displayName ?? null)) changes.displayName = m.displayName || null;
    if ((m.tableName || null) !== (ent.tableName ?? null) && !this.entityForm.tableName().invalid()) {
      changes.tableName = m.tableName || null;
    }
    if (m.extendsBase !== ent.extendsBase) {
      const ext = m.extendsBase;
      changes.extendsBase = ext;
      changes.repositoryType = getRepositoryType(ext);
      this.#emitStaleIndexDeletions(ent.extendsBase, ext);
    }
    if ((m.entityNamespace || null) !== (ent.entityNamespace ?? null)) {
      changes.entityNamespace = m.entityNamespace || null;
    }

    if (Object.keys(changes).length > 0) this.entityUpdated.emit(changes as DesignEntityChanges);
  }

  /** 实体 meta 字段 blur 后 300ms 防抖自动保存 */
  emitEntityChangesDebounced(): void {
    if (this.#debounceTimer) clearTimeout(this.#debounceTimer);
    this.#debounceTimer = setTimeout(() => {
      this.emitEntityChanges();
    }, 300);
  }

  addProperty() {
    const names = this.propertyNamesList();
    const name = generateUniqueName('newProperty', names);
    this.#knownPropertyIds.set(new Set(this.customProperties().map(p => p.id)));
    this.#expectingProperty.set(true);
    this.propertyAdded.emit({ name, type: 'string' });
  }

  /** 属性拖动排序 */
  onPropertyDrop(event: CdkDragDrop<DesignProperty[]>) {
    if (event.previousIndex === event.currentIndex) return;
    const props = this.customProperties();
    const moved = props[event.previousIndex];
    if (!moved) return;
    // 计算新位置的前后项
    const sorted = [...props];
    sorted.splice(event.previousIndex, 1);
    const prev = sorted[event.currentIndex - 1]?.sortOrder ?? null;
    const next = sorted[event.currentIndex]?.sortOrder ?? null;
    this.propertyUpdated.emit({ id: moved.id, changes: { sortOrder: sortOrderBetween(prev, next) } });
  }

  /** keyValue 子属性拖动排序（同一父级内） */
  onChildPropertyDrop(parentPropertyId: string, event: CdkDragDrop<DesignProperty[]>) {
    if (event.previousIndex === event.currentIndex) return;
    const children = this.childPropertiesMap().get(parentPropertyId) ?? [];
    const moved = children[event.previousIndex];
    if (!moved) return;
    const sorted = [...children];
    sorted.splice(event.previousIndex, 1);
    const prev = sorted[event.currentIndex - 1]?.sortOrder ?? null;
    const next = sorted[event.currentIndex]?.sortOrder ?? null;
    this.childPropertyUpdated.emit({ id: moved.id, changes: { sortOrder: sortOrderBetween(prev, next) } });
  }

  addChildProperty(parentPropertyId: string) {
    const children = this.childPropertiesMap().get(parentPropertyId) ?? [];
    const existingNames = children.map(c => c.name);
    const name = generateUniqueName('newField', existingNames);
    this.#knownChildIds.set(new Set(children.map(c => c.id)));
    this.#expectingChildParent.set(parentPropertyId);
    this.childPropertyAdded.emit({ parentPropertyId, name, type: 'string' });
  }

  /** 切换指定继承来源分组的展开/折叠状态 */
  toggleGroup(source: string) {
    const set = new Set(this.expandedGroups());
    if (set.has(source)) set.delete(source);
    else set.add(source);
    this.expandedGroups.set(set);
  }

  /** 展开/折叠全部继承分组（属性 + 关系） */
  toggleAllGroups(expanded: boolean) {
    if (!expanded) {
      this.expandedGroups.set(new Set());
      return;
    }
    const sources = new Set<string>();
    for (const g of this.inheritedPropertyGroups()) sources.add(g.source);
    for (const r of this.inheritedRelations()) sources.add(r.source);
    this.expandedGroups.set(sources);
  }

  /** 切换实体元信息展开 */
  toggleMeta() {
    this.metaExpanded.update(v => !v);
  }

  /** Esc 分层关闭：元信息展开时先收元信息，否则关闭面板 */
  onPanelEscape(): void {
    if (this.metaExpanded()) {
      this.metaExpanded.set(false);
      return;
    }
    this.closed.emit();
  }

  /** 切换属性/关系/索引项展开（同 id 再点收起） */
  toggleItemExpand(id: string) {
    this.expandedItemId.update(current => (current === id ? null : id));
  }

  /** 底部主按钮：添加关系并聚焦新项（由父层排序后选中最新 id 可选） */
  addRelationFromFooter() {
    const existingNames = this.relations().map(r => r.name);
    const name = generateUniqueName('newRelation', existingNames, 1);
    this.#knownRelationIds.set(new Set(this.relations().map(r => r.id)));
    this.#expectingRelation.set(true);
    this.relationAdded.emit({ name, kind: RELATION_KINDS.ONE_TO_MANY, targetEntity: '' });
  }

  /** 索引拖动排序 */
  onIndexDrop(event: CdkDragDrop<DesignIndex[]>) {
    if (event.previousIndex === event.currentIndex) return;
    const idxs = this.indexSnapshots();
    const moved = idxs[event.previousIndex];
    if (!moved) return;
    const sorted = [...idxs];
    sorted.splice(event.previousIndex, 1);
    const prev = sorted[event.currentIndex - 1]?.sortOrder ?? null;
    const next = sorted[event.currentIndex]?.sortOrder ?? null;
    this.indexUpdated.emit({ id: moved.id, changes: { sortOrder: sortOrderBetween(prev, next) } });
  }

  addIndex() {
    const props = this.allPropertiesForIndex();
    if (props.length === 0) return;
    this.#knownIndexIds.set(new Set(this.indexSnapshots().map(i => i.id)));
    this.#expectingIndex.set(true);
    this.indexAdded.emit({ propertyIds: [props[0].id], isUnique: false });
  }

  /** 滚动 tab 主体到底部，让新添加的项可见 */
  #scrollTabBodyToBottom(): void {
    const el = this.tabBody()?.nativeElement;
    el?.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }

  /**
   * 在列表中找到不在 known 集合里的首个新 id，并把整份列表记入 known。
   * @returns 新 id；没有新项时返回 null
   */
  #captureNewId<T extends { id: string }>(items: T[], known: WritableSignal<ReadonlySet<string>>): string | null {
    const fresh = items.find(i => !known().has(i.id));
    if (!fresh) return null;
    known.set(new Set(items.map(i => i.id)));
    return fresh.id;
  }

  /**
   * 当继承基类切换时，删除引用了已移除继承属性的索引。
   * @param oldBase 切换前的基类
   * @param newBase 切换后的基类
   */
  #emitStaleIndexDeletions(oldBase: string, newBase: string): void {
    const oldNames = new Set(
      getInheritedProperties(oldBase)
        .filter(p => p.category === 'property')
        .map(p => p.name)
    );
    const newNames = new Set(
      getInheritedProperties(newBase)
        .filter(p => p.category === 'property')
        .map(p => p.name)
    );
    const removedNames = [...oldNames].filter(n => !newNames.has(n));
    if (removedNames.length === 0) return;

    const staleIds = this.indexes()
      .filter(idx => idx.propertyIds.some(pid => removedNames.includes(pid)))
      .map(idx => idx.id);
    if (staleIds.length > 0) this.indexesDeleteBatch.emit(staleIds);
  }
}
