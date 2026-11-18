import type { ChangeSet, Records, SchemaManifest, Value } from '../model.js';
import { canonical } from '../records.js';
import { element, valueText } from './elements.js';
import { displayValue } from './labels.js';
import { tx } from './translate.js';

type Fields = Record<string, Value>;

/** 差异表的表头：变更类型、记录、字段、合并前、合并后。 */
function table(): HTMLTableElement {
  const node = element('table', '', 'table table-sm');
  const head = element('thead');
  const labels = element('tr');
  ['变更类型', '记录', '字段', '合并前', '合并后'].forEach(label => labels.append(element('th', label)));
  head.append(labels);
  node.append(head);
  return node;
}
/** 一条记录在差异表里的位置：记录标识、实体（显示取值时按清单认出只显示日期的字段）与变更类型。 */
interface DiffRow {
  id: string;
  entity: string;
  kind: string;
}
/** 一条记录逐字段的差异行：取值相同的字段跳过，某边没有的字段显示为「（不存在）」，只显示日期的字段显示日期部分。 */
function appendDiff(node: HTMLTableElement, schema: SchemaManifest, row: DiffRow, before: Fields, after: Fields): void {
  const shown = (fields: Fields, field: string) => valueText(displayValue(schema, row.entity, field, fields[field]));
  for (const field of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (canonical(before[field]) === canonical(after[field])) continue;
    const tr = element('tr');
    [row.kind, row.id, field, shown(before, field), shown(after, field)].forEach(text =>
      tr.append(element('td', text))
    );
    node.append(tr);
  }
}

/** 两份记录逐记录、逐字段的差异表，记录按标识排序：新增、删除与修改各自标出；取值按清单显示（见 `displayValue`）。 */
export function diffTable(before: Records, after: Records, schema: SchemaManifest): HTMLTableElement {
  const node = table();
  for (const id of [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()) {
    const kind =
      !before[id] ? tx('新增')
      : !after[id] ? tx('删除')
      : tx('修改');
    const entity = (after[id] ?? before[id]).entity;
    appendDiff(node, schema, { id, entity, kind }, before[id]?.fields ?? {}, after[id]?.fields ?? {});
  }
  return node;
}

/**
 * 一个提交自身的字段级变更表（列与 {@link diffTable} 相同）：「合并前」取单元的 `inversePatch`，「合并后」取 `patch`，
 * 只在一边出现的字段是新增或移除的字段。提交内容不可变，表格直接由服务端返回的单元生成，不需要再读父提交。
 */
export function changeTable(changes: readonly ChangeSet[], schema: SchemaManifest): HTMLTableElement {
  const node = table();
  const kinds = { insert: '新增', delete: '删除', update: '修改' } as const;
  for (const change of changes) {
    const row = { id: change.entityId, entity: change.entity, kind: tx(kinds[change.operation]) };
    appendDiff(node, schema, row, change.inversePatch ?? {}, change.patch ?? {});
  }
  return node;
}
