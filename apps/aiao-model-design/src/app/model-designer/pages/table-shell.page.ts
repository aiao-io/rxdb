import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  signal
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormField, form, pattern } from '@angular/forms/signals';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs/operators';
import { buildInheritedProperties, buildInheritedRelations } from '../components/shared/entity-edit-utils';
import {
  ENTITY_NAME_PATTERN,
  EXTENDS_OPTIONS,
  TABLE_NAME_PATTERN,
  generateUniqueName,
  getRepositoryType,
  type ExtendsOption
} from '../constants';
import { MODEL_DESIGNER_TRANSLATIONS } from '../i18n';
import type { DesignEntityChanges, DetailTab } from '../interfaces';
import type { DesignEntity } from '../models/index.js';
import { DesignerStateService } from '../services/designer-state.service';

/**
 * 表格视图 Shell 页面
 *
 * 路由：model-designer/table/:entityId
 * 包含实体元数据表单 + 标签页导航 + <router-outlet> 渲染子页面。
 */
@Component({
  selector: 'lib-table-shell-page',
  imports: [FormField, RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="flex h-full w-full flex-col">
      <!-- Entity Metadata -->
      @if (activeEntity(); as ent) {
        <div
          class="border-base-300 grid grid-cols-1 gap-2 border-b px-3 py-2 sm:grid-cols-2 lg:grid-cols-3 lg:px-4 xl:grid-cols-6"
        >
          <label class="min-w-0">
            <span class="text-base-content/60 text-xs">{{ t().entityPanel.name }}</span>
            <input
              class="input input-bordered lg:input-sm min-h-11 w-full lg:min-h-8"
              [class.input-error]="entityForm.name().invalid()"
              [formField]="entityForm.name"
              (blur)="emitEntityChanges()"
              (keydown.enter)="emitEntityChanges()"
              autocomplete="off"
            />
            @if (entityForm.name().invalid()) {
              <span class="text-error text-xs">{{ t().validation.entityNameHint }}</span>
            }
          </label>
          <label class="min-w-0">
            <span class="text-base-content/60 text-xs">{{ t().entityPanel.tableName }}</span>
            <input
              class="input input-bordered lg:input-sm min-h-11 w-full lg:min-h-8"
              [class.input-error]="entityForm.tableName().dirty() && entityForm.tableName().invalid()"
              [formField]="entityForm.tableName"
              [placeholder]="t().entityPanel.tableNamePlaceholder"
              (blur)="emitEntityChanges()"
              (keydown.enter)="emitEntityChanges()"
              autocomplete="off"
            />
            @if (entityForm.tableName().dirty() && entityForm.tableName().invalid()) {
              <span class="text-error text-xs">{{ t().validation.tableNameHint }}</span>
            }
          </label>
          <label class="min-w-0">
            <span class="text-base-content/60 text-xs">{{ t().entityPanel.displayName }}</span>
            <input
              class="input input-bordered lg:input-sm min-h-11 w-full lg:min-h-8"
              [formField]="entityForm.displayName"
              (blur)="emitEntityChanges()"
              (keydown.enter)="emitEntityChanges()"
              autocomplete="off"
            />
          </label>
          <label class="min-w-0">
            <span class="text-base-content/60 text-xs">{{ t().entityPanel.namespace }}</span>
            <input
              class="input input-bordered lg:input-sm min-h-11 w-full lg:min-h-8"
              [formField]="entityForm.entityNamespace"
              (blur)="emitEntityChanges()"
              (keydown.enter)="emitEntityChanges()"
              autocomplete="off"
            />
          </label>
          <label class="min-w-0">
            <span class="text-base-content/60 text-xs">{{ t().entityPanel.extends }}</span>
            <select
              class="select select-bordered lg:select-sm min-h-11 w-full lg:min-h-8"
              [attr.aria-label]="t().entityPanel.extends"
              [formField]="entityForm.extendsBase"
              (change)="emitEntityChanges()"
            >
              @for (opt of extendsOptions; track opt) {
                <option [value]="opt">{{ opt }}</option>
              }
            </select>
          </label>
          <div class="flex items-end">
            <button
              class="btn btn-ghost text-error lg:btn-sm min-h-11 w-full lg:min-h-8 lg:w-auto"
              (click)="onEntityDelete(ent.id)"
              type="button"
            >
              {{ t().entityPanel.deleteEntity }}
            </button>
          </div>
        </div>
      }

      <!-- Detail Tabs -->
      <div
        class="tabs tabs-bordered bg-base-100 flex flex-wrap items-center gap-1 px-2 py-1 lg:px-4 lg:py-0"
        role="tablist"
      >
        <a
          class="tab lg:tab-sm min-h-11 lg:min-h-8"
          [attr.aria-selected]="activeTab() === 'properties'"
          role="tab"
          routerLink="./properties"
          routerLinkActive="tab-active"
        >
          {{ t().entityPanel.properties }} ({{ propertiesCount() }})
        </a>
        <a
          class="tab lg:tab-sm min-h-11 lg:min-h-8"
          [attr.aria-selected]="activeTab() === 'relations'"
          role="tab"
          routerLink="./relations"
          routerLinkActive="tab-active"
        >
          {{ t().entityPanel.relations }} ({{ relationsCount() }})
        </a>
        <a
          class="tab lg:tab-sm min-h-11 lg:min-h-8"
          [attr.aria-selected]="activeTab() === 'indexes'"
          role="tab"
          routerLink="./indexes"
          routerLinkActive="tab-active"
        >
          {{ t().entityPanel.indexes }} ({{ indexesCount() }})
        </a>
        @if (activeEntity()) {
          <div class="ml-auto">
            @if (activeTab() === 'properties') {
              <button class="btn btn-primary lg:btn-xs min-h-11 lg:min-h-6" (click)="onAddProperty()" type="button">
                {{ t().tableView.addProperty }}
              </button>
            } @else if (activeTab() === 'relations') {
              <button class="btn btn-primary lg:btn-xs min-h-11 lg:min-h-6" (click)="onAddRelation()" type="button">
                {{ t().relationPanel.addRelation }}
              </button>
            } @else if (activeTab() === 'indexes') {
              <button class="btn btn-primary lg:btn-xs min-h-11 lg:min-h-6" (click)="onAddIndex()" type="button">
                {{ t().indexPanel.addIndex }}
              </button>
            }
          </div>
        }
      </div>

      <router-outlet />
    </div>
  `,
  styles: [
    `
      :host {
        display: contents;
      }
    `
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export default class TableShellPage {
  readonly #router = inject(Router);
  readonly #entityModel = linkedSignal(() => {
    const ent = this.activeEntity();
    return {
      name: ent?.name ?? '',
      displayName: ent?.displayName ?? '',
      tableName: ent?.tableName ?? '',
      extendsBase: ent?.extendsBase ?? 'EntityBase',
      entityNamespace: ent?.entityNamespace ?? ''
    };
  });
  readonly #extendsBase = computed(() => (this.activeEntity()?.extendsBase || 'EntityBase') as ExtendsOption);
  readonly #inheritedProperties = buildInheritedProperties(this.#extendsBase);
  readonly #inheritedRelations = buildInheritedRelations(this.#extendsBase);
  protected readonly t = inject(MODEL_DESIGNER_TRANSLATIONS);
  protected readonly state = inject(DesignerStateService);
  readonly extendsOptions = EXTENDS_OPTIONS;

  readonly entityId = input.required<string>();

  readonly activeEntity = computed<DesignEntity | null>(() => {
    const id = this.entityId();
    return this.state.entities().find(e => e.id === id) ?? null;
  });

  readonly entityForm = form(this.#entityModel, s => {
    pattern(s.name, ENTITY_NAME_PATTERN);
    pattern(s.tableName, TABLE_NAME_PATTERN);
  });

  readonly propertiesCount = computed(() => {
    const ent = this.activeEntity();
    if (!ent) return 0;
    const custom = this.state.propertiesMap().get(ent.id) ?? [];
    return this.#inheritedProperties().length + custom.length;
  });

  readonly relationsCount = computed(() => {
    const ent = this.activeEntity();
    if (!ent) return 0;
    const custom = this.state.relationsMap().get(ent.id) ?? [];
    return this.#inheritedRelations().length + custom.length;
  });

  readonly indexesCount = computed(() => {
    const ent = this.activeEntity();
    if (!ent) return 0;
    return (this.state.indexesMap().get(ent.id) ?? []).length;
  });

  /** 从当前 URL 推导激活的标签页 */
  readonly activeTab = signal<DetailTab>('properties');

  constructor() {
    const destroyRef = inject(DestroyRef);

    // entity 选中同步
    effect(() => {
      const id = this.entityId();
      const entitySelected = this.state.onEntitySelected(id);
      if (!entitySelected && this.state.entities().length > 0) {
        void this.#router.navigate(['model-designer', 'canvas']);
      }
    });

    // 从 URL 推导当前激活的标签页
    this.#router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        map(e => e.urlAfterRedirects),
        startWith(this.#router.url),
        takeUntilDestroyed(destroyRef)
      )
      .subscribe(url => {
        if (url.includes('/relations')) this.activeTab.set('relations');
        else if (url.includes('/indexes')) this.activeTab.set('indexes');
        else this.activeTab.set('properties');
      });
  }

  emitEntityChanges() {
    const ent = this.activeEntity();
    if (!ent) return;
    const m = this.#entityModel();
    const changes: Partial<DesignEntityChanges> = {};

    if (m.name !== ent.name && !this.entityForm.name().invalid()) changes.name = m.name;
    if ((m.displayName || null) !== (ent.displayName ?? null)) changes.displayName = m.displayName || null;
    if ((m.tableName || null) !== (ent.tableName ?? null) && !this.entityForm.tableName().invalid()) {
      changes.tableName = m.tableName || null;
    }
    if (m.extendsBase !== ent.extendsBase) {
      const ext = m.extendsBase as ExtendsOption;
      changes.extendsBase = ext;
      changes.repositoryType = getRepositoryType(ext);
    }
    if ((m.entityNamespace || null) !== (ent.entityNamespace ?? null)) {
      changes.entityNamespace = m.entityNamespace || null;
    }

    if (Object.keys(changes).length > 0) {
      this.state.onTableEntityUpdated({ id: ent.id, changes: changes as DesignEntityChanges });
    }
  }

  async onEntityDelete(id: string): Promise<void> {
    const deleted = await this.state.onEntityDeleted(id);
    if (deleted) await this.#router.navigate(['model-designer', 'canvas']);
  }

  onAddProperty() {
    const entity = this.activeEntity();
    if (!entity) return;
    const props = this.state.propertiesMap().get(entity.id) ?? [];
    const name = generateUniqueName(
      'newProperty',
      props.map(p => p.name)
    );
    this.state.onPropertyAdded({ entityId: entity.id, name, type: 'string' });
  }

  onAddRelation() {
    const entity = this.activeEntity();
    if (!entity) return;
    const rels = this.state.relationsMap().get(entity.id) ?? [];
    const name = generateUniqueName(
      'newRelation',
      rels.map(r => r.name),
      1
    );
    this.state.onRelationAdded({ entityId: entity.id, name, kind: 'ONE_TO_MANY', targetEntity: '' });
  }

  onAddIndex() {
    const entity = this.activeEntity();
    if (!entity) return;
    const props = this.state.propertiesMap().get(entity.id) ?? [];
    this.state.onIndexAdded({
      entityId: entity.id,
      propertyIds: props.length > 0 ? [props[0].id] : [],
      isUnique: false
    });
  }
}
