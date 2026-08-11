import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { ConnectionGuardComponent } from '../components/connection-guard.component';
import { DatabaseStateService } from '../services/database-state.service';
// P2-16：不再自带一份拷贝，统一用 opfs-page.utils 里的唯一实现
import { formatFileSize } from './opfs-page.utils';

const STORAGE_ENTITY = 'StorageFileMeta';
const STORAGE_NAMESPACE = 'storage';

interface StorageRow {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  opfsPath: string;
  contentVersion: number;
  createdAt?: string | number;
  updatedAt?: string | number;
}

function isStorageRow(value: unknown): value is StorageRow {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row['id'] === 'string' &&
    row['id'].length > 0 &&
    typeof row['name'] === 'string' &&
    typeof row['mimeType'] === 'string' &&
    typeof row['size'] === 'number' &&
    Number.isFinite(row['size']) &&
    typeof row['opfsPath'] === 'string' &&
    Number.isSafeInteger(row['contentVersion'])
  );
}

function formatDate(timestamp?: number | string | Date): string {
  if (!timestamp) return '';
  const d = timestamp instanceof Date ? timestamp : new Date(timestamp);
  return isNaN(d.getTime()) ? '' : d.toLocaleString();
}

@Component({
  selector: 'app-storage-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ConnectionGuardComponent],
  template: `
    <app-connection-guard>
      <div class="flex h-full flex-col">
        <!-- Header -->
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
              <rect height="8" rx="2" ry="2" width="20" x="2" y="2" />
              <rect height="8" rx="2" ry="2" width="20" x="2" y="14" />
              <line x1="6" x2="6.01" y1="6" y2="6" />
              <line x1="6" x2="6.01" y1="18" y2="18" />
            </svg>
            <span class="text-sm font-medium">Storage</span>
            @if (rows().length > 0) {
              <span class="badge badge-xs">{{ rows().length }} 条</span>
            }
            <span
              class="tooltip tooltip-bottom cursor-help text-xs opacity-40"
              data-tip="数据来源：RxDB StorageFileMeta 实体"
              >ⓘ</span
            >
          </div>
          <button class="btn btn-ghost btn-xs" [disabled]="loading()" (click)="refresh()">
            @if (loading()) {
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

        <!-- Content -->
        <div class="flex-1 overflow-auto">
          @if (loading() && rows().length === 0) {
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
          } @else if (error()) {
            <div class="text-error p-3 text-sm">{{ error() }}</div>
          } @else if (rows().length === 0) {
            <div class="flex h-full items-center justify-center text-xs opacity-50">
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
                  <rect height="8" rx="2" ry="2" width="20" x="2" y="2" />
                  <rect height="8" rx="2" ry="2" width="20" x="2" y="14" />
                  <line x1="6" x2="6.01" y1="6" y2="6" />
                  <line x1="6" x2="6.01" y1="18" y2="18" />
                </svg>
                无存储文件
              </div>
            </div>
          } @else {
            <div class="overflow-x-auto">
              <table class="table-xs table-pin-rows table">
                <thead>
                  <tr>
                    <th>名称</th>
                    <th>大小</th>
                    <th>类型</th>
                    <th>路径</th>
                    <th>版本</th>
                    <th>创建时间</th>
                    <th>更新时间</th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of rows(); track row.id) {
                    <tr
                      class="hover cursor-pointer"
                      [attr.aria-selected]="selectedId() === row.id"
                      [class.bg-base-200]="selectedId() === row.id"
                      (click)="selectRow(row)"
                      (keydown.enter)="selectRow(row)"
                      (keydown.space)="selectRow(row); $event.preventDefault()"
                      tabindex="0"
                    >
                      <td class="max-w-40 truncate">{{ row.name }}</td>
                      <td class="whitespace-nowrap">{{ fmtSize(row.size) }}</td>
                      <td>
                        <span class="badge badge-ghost badge-xs">{{ row.mimeType }}</span>
                      </td>
                      <td class="max-w-48 truncate font-mono text-xs">{{ row.opfsPath }}</td>
                      <td>{{ row.contentVersion }}</td>
                      <td class="whitespace-nowrap">{{ fmtDate(row.createdAt) }}</td>
                      <td class="whitespace-nowrap">{{ fmtDate(row.updatedAt) }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </div>

        <!-- Detail Panel -->
        @if (selectedRow(); as row) {
          <div class="border-base-300 bg-base-200 border-t">
            <div class="flex items-center justify-between px-3 py-1.5">
              <span class="text-xs font-semibold">详情</span>
              <button class="btn btn-ghost btn-xs btn-circle" (click)="selectedId.set(null)">✕</button>
            </div>
            <div class="max-h-32 overflow-auto px-3 pb-2">
              <pre class="overflow-x-auto text-xs">{{ detailJson() }}</pre>
            </div>
          </div>
        }
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
export class StoragePage implements OnInit {
  private readonly databaseState = inject(DatabaseStateService);

  readonly fmtSize = formatFileSize;
  readonly fmtDate = formatDate;
  readonly loading = computed(() => this.databaseState.isEntityLoading(STORAGE_ENTITY, STORAGE_NAMESPACE));
  readonly selectedId = signal<string | null>(null);

  /** 仅消费 StorageFileMeta 的查询结果，避免与 Database 页共享状态时串数据 */
  private readonly storageData = computed(() => {
    return this.databaseState.getEntityData(STORAGE_ENTITY, STORAGE_NAMESPACE);
  });

  private readonly parsedRows = computed(() => {
    const data = this.storageData();
    if (!data || data.error) return { rows: [] as StorageRow[], error: null as string | null };
    const ids = new Set<string>();
    const rows: StorageRow[] = [];
    for (const value of data.data) {
      if (!isStorageRow(value) || ids.has(value.id)) {
        return { rows: [], error: 'StorageFileMeta 返回了无效或重复的实体数据' };
      }
      ids.add(value.id);
      rows.push(value);
    }
    rows.sort((a, b) => a.opfsPath.localeCompare(b.opfsPath));
    return { rows, error: null };
  });

  readonly rows = computed(() => this.parsedRows().rows);

  readonly error = computed(() => this.storageData()?.error ?? this.parsedRows().error);

  readonly selectedRow = computed(() => {
    const id = this.selectedId();
    if (!id) return null;
    return this.rows().find(r => r.id === id) ?? null;
  });

  readonly detailJson = computed(() => {
    const row = this.selectedRow();
    return row ? JSON.stringify(row, null, 2) : '';
  });

  ngOnInit(): void {
    this.refresh();
  }

  refresh(): void {
    this.databaseState.queryEntity(STORAGE_ENTITY, STORAGE_NAMESPACE);
  }

  selectRow(row: { id: string }): void {
    this.selectedId.set(this.selectedId() === row.id ? null : row.id);
  }
}
