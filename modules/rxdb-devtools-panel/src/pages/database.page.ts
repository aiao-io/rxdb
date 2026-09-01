import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { ConnectionGuardComponent } from '../components/connection-guard.component';
import { DevToolsValueComponent } from '../components/devtools-value.component';
import { DatabaseStateService } from '../services/database-state.service';
import type { EntityInfo } from '../types/devtools.types';

/**
 * Database 页面
 * 查看数据库信息和实体数据
 */
@Component({
  selector: 'app-database-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ConnectionGuardComponent, DevToolsValueComponent],
  template: `
    <app-connection-guard>
      <div class="flex h-full">
        <!-- 左侧：实体列表 -->
        <div class="border-base-300 bg-base-200 flex w-48 flex-col overflow-y-auto border-r">
          <div class="border-base-300 flex items-center justify-between border-b px-2 py-1.5">
            <span class="text-xs font-semibold">实体</span>
            <button class="btn btn-ghost btn-xs" [disabled]="dbLoading()" (click)="refresh()">
              @if (dbLoading()) {
                <svg
                  class="animate-spin"
                  fill="none"
                  height="12"
                  stroke="currentColor"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  viewBox="0 0 24 24"
                  width="12"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
              } @else {
                <svg
                  fill="none"
                  height="12"
                  stroke="currentColor"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  viewBox="0 0 24 24"
                  width="12"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                  <path d="M21 3v5h-5" />
                  <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                  <path d="M8 16H3v5" />
                </svg>
              }
            </button>
          </div>

          @if (!dbInfo() && !dbLoading()) {
            <div class="flex flex-1 items-center justify-center">
              <div class="text-center text-xs opacity-50">
                <svg
                  class="mx-auto mb-2 opacity-30"
                  fill="none"
                  height="24"
                  stroke="currentColor"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  viewBox="0 0 24 24"
                  width="24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <ellipse cx="12" cy="5" rx="9" ry="3" />
                  <path d="M3 5V19A9 3 0 0 0 21 19V5" />
                  <path d="M3 12A9 3 0 0 0 21 12" />
                </svg>
                点击刷新
              </div>
            </div>
          }

          @if (dbInfo(); as info) {
            @if (groupedEntities(); as grouped) {
              <ul class="menu menu-xs w-full flex-1 p-0">
                @for (entity of grouped.publicEntities; track entity.name) {
                  <li>
                    <button
                      class="w-full"
                      [class.active]="selectedEntityKey() === entityKey(entity)"
                      (click)="selectEntity(entity)"
                      type="button"
                    >
                      <svg
                        fill="none"
                        height="12"
                        stroke="currentColor"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        viewBox="0 0 24 24"
                        width="12"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path d="M12 3v18" />
                        <rect height="18" rx="2" width="18" x="3" y="3" />
                        <path d="M3 9h18" />
                        <path d="M3 15h18" />
                      </svg>
                      {{ entity.name }}
                    </button>
                  </li>
                }

                @for (group of grouped.namespacedGroups; track group.namespace) {
                  <li class="menu-title px-2 pt-3 pb-1">
                    <span class="flex items-center justify-between text-[10px] tracking-[0.2em] uppercase opacity-50">
                      <span>{{ group.namespace }}</span>
                      <span class="badge badge-ghost badge-xs">{{ group.entities.length }}</span>
                    </span>
                  </li>

                  @for (entity of group.entities; track entity.name) {
                    <li>
                      <button
                        class="w-full"
                        [class.active]="selectedEntityKey() === entityKey(entity)"
                        (click)="selectEntity(entity)"
                        type="button"
                      >
                        <svg
                          fill="none"
                          height="12"
                          stroke="currentColor"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          viewBox="0 0 24 24"
                          width="12"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path d="M12 3v18" />
                          <rect height="18" rx="2" width="18" x="3" y="3" />
                          <path d="M3 9h18" />
                          <path d="M3 15h18" />
                        </svg>
                        {{ entity.name }}
                      </button>
                    </li>
                  }
                }
              </ul>
            }
            <div class="border-base-300 border-t px-2 py-1 text-xs opacity-50">
              {{ info.dbName }} · v{{ info.version }}
            </div>
          }
        </div>

        <!-- 右侧：数据展示 -->
        <div class="flex flex-1 flex-col overflow-hidden">
          @if (!selectedEntity()) {
            <div class="flex flex-1 items-center justify-center text-xs opacity-50">
              <div class="text-center">
                <svg
                  class="mx-auto mb-2 opacity-30"
                  fill="none"
                  height="32"
                  stroke="currentColor"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  viewBox="0 0 24 24"
                  width="32"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M12 3v18" />
                  <rect height="18" rx="2" width="18" x="3" y="3" />
                  <path d="M3 9h18" />
                  <path d="M3 15h18" />
                </svg>
                选择一个实体查看数据
              </div>
            </div>
          } @else {
            <!-- 头部 -->
            <div class="border-base-300 bg-base-200 flex items-center justify-between border-b px-3 py-2">
              <div class="flex items-center gap-2">
                <svg
                  fill="none"
                  height="14"
                  stroke="currentColor"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  viewBox="0 0 24 24"
                  width="14"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M12 3v18" />
                  <rect height="18" rx="2" width="18" x="3" y="3" />
                  <path d="M3 9h18" />
                  <path d="M3 15h18" />
                </svg>
                <span class="text-sm font-medium">{{ selectedEntityLabel() }}</span>
                @if (entityData()?.data; as data) {
                  <span class="badge badge-xs">{{ data.length }} 条</span>
                }
              </div>
              <button class="btn btn-ghost btn-xs" [disabled]="entityLoading()" (click)="refreshEntity()">
                @if (entityLoading()) {
                  <svg
                    class="animate-spin"
                    fill="none"
                    height="12"
                    stroke="currentColor"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    viewBox="0 0 24 24"
                    width="12"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                } @else {
                  <svg
                    fill="none"
                    height="12"
                    stroke="currentColor"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    viewBox="0 0 24 24"
                    width="12"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                    <path d="M21 3v5h-5" />
                    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                    <path d="M8 16H3v5" />
                  </svg>
                }
              </button>
            </div>

            <!-- 数据区域 -->
            <div class="flex-1 overflow-auto p-2">
              @if (entityLoading()) {
                <div class="flex h-full items-center justify-center">
                  <svg
                    class="animate-spin opacity-50"
                    fill="none"
                    height="24"
                    stroke="currentColor"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    viewBox="0 0 24 24"
                    width="24"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                </div>
              } @else if (entityData(); as data) {
                @if (data.error) {
                  <div class="text-error p-2 text-sm">{{ data.error }}</div>
                } @else if (data.data) {
                  @if (data.data.length === 0) {
                    <div class="flex h-full items-center justify-center text-xs opacity-50">无数据</div>
                  } @else {
                    <div class="space-y-1">
                      @for (item of data.data; track $index) {
                        <div class="bg-base-200 rounded p-2">
                          <div class="overflow-x-auto">
                            <app-devtools-value [value]="item" />
                          </div>
                        </div>
                      }
                    </div>
                  }
                }
              }
            </div>
          }
        </div>
      </div>
    </app-connection-guard>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
      }
    `
  ]
})
export class DatabasePage implements OnInit {
  private readonly databaseState = inject(DatabaseStateService);

  readonly dbInfo = this.databaseState.dbInfo;
  readonly dbLoading = this.databaseState.dbLoading;
  readonly selectedEntity = signal<EntityInfo | null>(null);
  readonly selectedEntityKey = computed(() => {
    const entity = this.selectedEntity();
    return entity ? this.entityKey(entity) : null;
  });
  readonly selectedEntityLabel = computed(() => {
    const entity = this.selectedEntity();
    if (!entity) return '';
    const namespace = entity.namespace || 'public';
    return namespace === 'public' ? entity.name : `${namespace}:${entity.name}`;
  });
  readonly entityLoading = computed(() => {
    const entity = this.selectedEntity();
    return entity ? this.databaseState.isEntityLoading(entity.name, entity.namespace || 'public') : false;
  });

  /** 仅展示与当前选中实体匹配的查询结果，避免与 Storage 页共享状态时串数据 */
  readonly entityData = computed(() => {
    const entity = this.selectedEntity();
    return entity ? this.databaseState.getEntityData(entity.name, entity.namespace || 'public') : null;
  });
  readonly groupedEntities = computed(() => {
    const info = this.dbInfo();

    if (!info) {
      return {
        publicEntities: [] as EntityInfo[],
        namespacedGroups: [] as Array<{ namespace: string; entities: EntityInfo[] }>
      };
    }

    const publicEntities: EntityInfo[] = [];
    const namespacedGroups = new Map<string, EntityInfo[]>();

    for (const entity of info.entities) {
      if (!entity.name) {
        continue;
      }

      const namespace = entity.namespace || 'public';

      if (namespace === 'public') {
        publicEntities.push(entity);
        continue;
      }

      const group = namespacedGroups.get(namespace);
      if (group) {
        group.push(entity);
      } else {
        namespacedGroups.set(namespace, [entity]);
      }
    }

    return {
      publicEntities,
      namespacedGroups: Array.from(namespacedGroups, ([namespace, entities]) => ({ namespace, entities }))
    };
  });

  ngOnInit(): void {
    this.refresh();
  }

  refresh(): void {
    this.databaseState.inspectDb();
  }

  selectEntity(entity: EntityInfo): void {
    this.selectedEntity.set(entity);
    this.databaseState.queryEntity(entity.name, entity.namespace || 'public');
  }

  refreshEntity(): void {
    const entity = this.selectedEntity();
    if (entity) {
      this.databaseState.queryEntity(entity.name, entity.namespace || 'public');
    }
  }

  entityKey(entity: EntityInfo): string {
    return `${entity.namespace || 'public'}:${entity.name}`;
  }
}
