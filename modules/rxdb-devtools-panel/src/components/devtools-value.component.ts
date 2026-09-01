import { DEVTOOLS_WIRE_VERSION, type DevToolsBigIntValue, type DevToolsBinaryValue } from '@aiao/rxdb-devtools';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Visual type labels used by the read-only wire value viewer. */
export type DevToolsDisplayKind =
  'array' | 'bigint' | 'binary' | 'boolean' | 'null' | 'number' | 'object' | 'string' | 'undefined' | 'unsupported';

/** A flattened, deterministic row in the read-only wire value viewer. */
export interface DevToolsDisplayRow {
  readonly key: string;
  readonly path: string;
  readonly depth: number;
  readonly kind: DevToolsDisplayKind;
  readonly value: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBigIntValue(value: Record<string, unknown>): value is Record<string, unknown> & DevToolsBigIntValue {
  return value['$rxdb'] === DEVTOOLS_WIRE_VERSION && value['type'] === 'bigint' && typeof value['value'] === 'string';
}

function isBinaryValue(value: Record<string, unknown>): value is Record<string, unknown> & DevToolsBinaryValue {
  return (
    value['$rxdb'] === DEVTOOLS_WIRE_VERSION &&
    value['type'] === 'binary' &&
    value['encoding'] === 'base64url' &&
    typeof value['value'] === 'string' &&
    Number.isSafeInteger(value['byteLength']) &&
    (value['byteLength'] as number) >= 0
  );
}

function unsupportedVersion(value: Record<string, unknown>): string {
  const version = value['$rxdb'];
  return `DevTools wire version ${typeof version === 'number' || typeof version === 'string' ? version : 'unknown'}`;
}

function appendDisplayRows(rows: DevToolsDisplayRow[], value: unknown, key: string, path: string, depth: number): void {
  if (isRecord(value) && Object.hasOwn(value, '$rxdb')) {
    if (isBigIntValue(value)) {
      rows.push({ key, path, depth, kind: 'bigint', value: value.value });
      return;
    }
    if (isBinaryValue(value)) {
      rows.push({ key, path, depth, kind: 'binary', value: `${value.value} · ${value.byteLength} bytes` });
      return;
    }
    rows.push({ key, path, depth, kind: 'unsupported', value: unsupportedVersion(value) });
    return;
  }

  if (Array.isArray(value)) {
    rows.push({ key, path, depth, kind: 'array', value: `${value.length} items` });
    value.forEach((item, index) => appendDisplayRows(rows, item, `[${index}]`, `${path}[${index}]`, depth + 1));
    return;
  }

  if (isRecord(value)) {
    rows.push({ key, path, depth, kind: 'object', value: 'Object' });
    for (const [childKey, childValue] of Object.entries(value)) {
      appendDisplayRows(rows, childValue, childKey, `${path}.${childKey}`, depth + 1);
    }
    return;
  }

  if (value === null) {
    rows.push({ key, path, depth, kind: 'null', value: 'null' });
    return;
  }

  const kind = typeof value;
  if (kind === 'bigint') {
    rows.push({ key, path, depth, kind: 'bigint', value: String(value) });
    return;
  }
  if (kind === 'number' || kind === 'boolean' || kind === 'string' || kind === 'undefined') {
    rows.push({ key, path, depth, kind, value: String(value) });
    return;
  }
  rows.push({ key, path, depth, kind: 'unsupported', value: kind });
}

/** Builds deterministic display rows without decoding wire values back to runtime values. */
export function toDevToolsDisplayRows(value: unknown): DevToolsDisplayRow[] {
  const rows: DevToolsDisplayRow[] = [];
  appendDisplayRows(rows, value, '$', '$', 0);
  return rows;
}

/** Read-only structured viewer for DevTools wire values. */
@Component({
  selector: 'app-devtools-value',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-w-max font-mono text-xs">
      @for (row of rows(); track row.path) {
        <div
          class="border-base-300 flex min-h-7 items-center gap-2 border-b border-dotted py-1 pr-2 last:border-b-0"
          [attr.data-value-kind]="row.kind"
        >
          <span class="inline-block min-w-28 font-medium" [style.padding-left.px]="row.depth * 14">{{ row.key }}</span>
          <span
            class="badge badge-xs shrink-0"
            [class.badge-ghost]="
              row.kind !== 'bigint' && row.kind !== 'binary' && row.kind !== 'number' && row.kind !== 'unsupported'
            "
            [class.badge-info]="row.kind === 'binary'"
            [class.badge-primary]="row.kind === 'bigint'"
            [class.badge-success]="row.kind === 'number'"
            [class.badge-warning]="row.kind === 'unsupported'"
          >
            {{ row.kind }}
          </span>
          <span class="max-w-2xl break-all whitespace-pre-wrap">{{ row.value }}</span>
        </div>
      }
    </div>
  `
})
export class DevToolsValueComponent {
  readonly value = input.required<unknown>();
  readonly rows = computed(() => toDevToolsDisplayRows(this.value()));
}
