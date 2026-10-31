import type { DevToolsEntityField, DevToolsEntityFieldType, DevToolsEntityModel } from '@aiao/rxdb-devtools';
import {
  actionsColumn,
  buildPropertyColumn,
  type EntityTableRecord,
  type PropertyColumnConfig
} from '@aiao/rxdb-model';
import { EntityTableComponent } from '@aiao/rxdb-model-angular';
import { Component, computed, input, output, signal } from '@angular/core';
import type { ColumnDefine, ListTableConstructorOptions } from '@visactor/vtable/es/ts-types/index.js';
import { DevToolsValueComponent, toDevToolsDisplayRows, type DevToolsDisplayRow } from '../devtools-value.component';

/** 只读实体数据表格的行值。 */
export type EntityDataRecord = Record<string, unknown>;

function isRecord(value: unknown): value is EntityDataRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function inferFieldType(name: string, value: unknown): DevToolsEntityFieldType {
  if (name === 'id') return 'uuid';
  if (name === 'createdAt' || name === 'updatedAt') return 'date';
  if (Array.isArray(value)) {
    if (value.every(item => typeof item === 'string')) return 'stringArray';
    if (value.every(item => typeof item === 'number')) return 'numberArray';
    return 'json';
  }
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
  if (typeof value === 'string') return 'string';
  return 'json';
}

function inferFields(records: readonly EntityDataRecord[]): DevToolsEntityField[] {
  const fields = new Map<string, DevToolsEntityField>();
  for (const record of records) {
    for (const [name, value] of Object.entries(record)) {
      if (fields.has(name)) continue;
      fields.set(name, { name, type: inferFieldType(name, value) });
    }
  }
  return [...fields.values()];
}

/** 没有模型消息时从查询结果推导字段，保证旧连接器仍能浏览数据。 */
export function resolveEntityFields(
  model: DevToolsEntityModel | null,
  records: readonly EntityDataRecord[]
): DevToolsEntityField[] {
  const inferred = inferFields(records);
  if (model === null) return inferred;

  const fields = new Map(model.fields.map(field => [field.name, field]));
  for (const field of inferred) {
    if (!fields.has(field.name)) fields.set(field.name, field);
  }
  return [...fields.values()];
}

/** 空数据也要让固定列填满表格容器，避免只剩操作列时出现窄表格。 */
export const ENTITY_DATA_TABLE_OPTIONS = {
  widthMode: 'adaptive',
  rowSeriesNumber: {
    title: '',
    width: 40,
    dragOrder: false
  }
} satisfies Partial<ListTableConstructorOptions>;

/** 为画布表格提供可访问的字段、运行时类型和值文本。 */
export function buildEntityDataAccessibilityRows(records: readonly EntityDataRecord[]): DevToolsDisplayRow[] {
  return records.flatMap(record => toDevToolsDisplayRows(record));
}

/** 构建只读模型列；列工具仍负责日期、枚举、数组和 JSON 的具体展示。 */
export function buildEntityDataColumns(
  model: DevToolsEntityModel | null,
  records: readonly EntityDataRecord[]
): ColumnDefine[] {
  const fields = resolveEntityFields(model, records);
  const columns = fields.map(field => {
    const config: PropertyColumnConfig = {
      field: field.name,
      title: field.displayName ?? field.name,
      type: field.type,
      readonly: true,
      nullable: field.nullable,
      enumValues: field.enumValues,
      options: field.options,
      sort: true
    };
    return buildPropertyColumn(config);
  });
  return [...columns, actionsColumn('操作', '删除', () => false, '查看')];
}

/**
 * 数据库实体只读表格。
 *
 * 表格沿用 rxdb-model 的列构建和 VTable 渲染能力，但关闭所有写入入口；查看按钮只打开
 * 当前行的完整结构化值，便于检查 JSON、数组、BigInt 和二进制信封。
 */
@Component({
  selector: 'app-entity-data-table',
  imports: [EntityTableComponent, DevToolsValueComponent],
  template: `
    <div class="relative h-full min-h-0">
      <rxdb-entity-table
        [columns]="columns()"
        [loading]="loading()"
        [records]="records()"
        [rowDragEnabled]="false"
        [tableOptions]="tableOptions"
        (iconClicked)="onIconClicked($event)"
      />

      <div class="sr-only" aria-label="实体记录">
        @for (row of accessibilityRows(); track $index) {
          <div>{{ row.key }} {{ row.kind }} {{ row.value }}</div>
        }
      </div>

      @if (selectedRecord(); as record) {
        <div class="bg-base-300/60 absolute inset-0 z-20 flex items-center justify-center p-4" role="presentation">
          <section
            class="bg-base-100 border-base-300 flex max-h-full w-full max-w-4xl flex-col rounded-lg border shadow-xl"
            aria-labelledby="entity-record-detail-title"
            aria-modal="true"
            role="dialog"
          >
            <header class="border-base-300 flex items-center justify-between border-b px-4 py-3">
              <h2 class="text-sm font-semibold" id="entity-record-detail-title">记录详情</h2>
              <button class="btn btn-ghost btn-sm" (click)="closeDetail()" aria-label="关闭记录详情" type="button">
                关闭
              </button>
            </header>
            <div class="min-h-0 flex-1 overflow-auto p-3">
              <app-devtools-value [value]="record" />
            </div>
          </section>
        </div>
      }
    </div>
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
export class EntityDataTableComponent {
  readonly data = input<readonly unknown[]>([]);
  readonly model = input<DevToolsEntityModel | null>(null);
  readonly loading = input(false);

  readonly records = computed<EntityTableRecord[]>(() =>
    this.data()
      .filter(isRecord)
      .map(record => ({ ...record }))
  );
  readonly columns = computed(() => buildEntityDataColumns(this.model(), this.records()));
  readonly accessibilityRows = computed(() => buildEntityDataAccessibilityRows(this.records()));
  readonly selectedRecord = signal<EntityDataRecord | null>(null);
  readonly tableOptions = ENTITY_DATA_TABLE_OPTIONS;

  readonly recordViewed = output<EntityDataRecord>();

  onIconClicked(event: { name: string; record: EntityTableRecord }): void {
    if (event.name !== 'view-action') return;
    const record = { ...event.record };
    this.selectedRecord.set(record);
    this.recordViewed.emit(record);
  }

  closeDetail(): void {
    this.selectedRecord.set(null);
  }
}
