import type { ChangeSet, Records, SchemaManifest, Value } from '../model.js';
import { canonical } from '../records.js';
import { schemaModel } from '../schema.js';
import { badge, element, type BadgeTone } from './elements.js';
import { fieldText } from './labels.js';
import { cellText, titleOf } from './records-view.js';
import { tx } from './translate.js';

type Fields = Record<string, Value>;
type Kind = 'insert' | 'delete' | 'update';

const kinds: Record<Kind, { label: string; tone: BadgeTone }> = {
  insert: { label: '新增', tone: 'success' },
  delete: { label: '删除', tone: 'error' },
  update: { label: '修改', tone: 'warning' }
};

/** 差异表的表头：变更类型、记录、字段、合并前、合并后。 */
function table(): { frame: HTMLElement; body: HTMLTableSectionElement } {
  const frame = element('div', '', 'overflow-x-auto rounded-box border border-base-300');
  const node = element('table', '', 'table table-sm');
  const head = element('thead');
  const labels = element('tr');
  ['变更类型', '记录', '字段', '合并前', '合并后'].forEach(label => labels.append(element('th', label)));
  head.append(labels);
  const body = element('tbody');
  node.append(head, body);
  frame.append(node);
  return { frame, body };
}

/** 一条记录在差异表里的位置：记录标识、名称、实体（按清单显示字段标签与取值）与变更类型。 */
interface DiffRow {
  id: string;
  name: string;
  entity: string;
  kind: Kind;
}

/**
 * 一条记录逐字段的差异行：取值相同的字段跳过；某边没有的字段显示为「（不存在）」，其余按清单显示（只显示日期的字段显示日期部分）。
 * 合并前、合并后两列分别以浅红、浅绿底色区分，文字保持正文颜色。
 */
function appendDiff(
  body: HTMLTableSectionElement,
  schema: SchemaManifest,
  records: Records,
  row: DiffRow,
  before: Fields,
  after: Fields
): void {
  const shown = (fields: Fields, field: string) =>
    Object.hasOwn(fields, field) ? cellText(schema, records, row.entity, field, fields[field]) : tx('（不存在）');
  for (const field of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (canonical(before[field]) === canonical(after[field])) continue;
    const tr = element('tr');
    tr.dataset['recordId'] = row.id;
    const kind = element('td');
    kind.append(badge(kinds[row.kind].label, kinds[row.kind].tone));
    const name = element('td', row.name, 'font-medium');
    name.title = row.id;
    tr.append(
      kind,
      name,
      element('td', tx(fieldText(schema, row.entity, field))),
      element('td', shown(before, field), 'bg-error/10'),
      element('td', shown(after, field), 'bg-success/10')
    );
    body.append(tr);
  }
}

/** 两份记录逐记录、逐字段的差异表，记录按标识排序：新增、删除与修改各自标出；取值按清单显示。 */
export function diffTable(before: Records, after: Records, schema: SchemaManifest): HTMLElement {
  const { frame, body } = table();
  const model = schemaModel(schema);
  const both = { ...before, ...after };
  for (const id of [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()) {
    const kind: Kind =
      !before[id] ? 'insert'
      : !after[id] ? 'delete'
      : 'update';
    const row = after[id] ?? before[id];
    const name = titleOf(model.entity(row.entity), id, row);
    appendDiff(
      body,
      schema,
      both,
      { id, name, entity: row.entity, kind },
      before[id]?.fields ?? {},
      after[id]?.fields ?? {}
    );
  }
  if (!body.children.length) return noChanges();
  return frame;
}

/**
 * 一个提交自身的字段级变更表（列与 {@link diffTable} 相同）：「合并前」取单元的 `inversePatch`，「合并后」取 `patch`，
 * 只在一边出现的字段是新增或移除的字段。提交内容不可变，表格直接由服务端返回的单元生成，不需要再读父提交。
 * @param records 用来显示记录名称与关联目标名称的记录（通常是该提交时刻的整份记录）。
 */
export function changeTable(changes: readonly ChangeSet[], schema: SchemaManifest, records: Records = {}): HTMLElement {
  const { frame, body } = table();
  const model = schemaModel(schema);
  for (const change of changes) {
    const fields = { ...change.inversePatch, ...change.patch };
    const row = records[change.entityId] ?? { entity: change.entity, fields };
    const name = titleOf(model.entity(change.entity), change.entityId, row);
    const target = { id: change.entityId, name, entity: change.entity, kind: change.operation };
    appendDiff(body, schema, records, target, change.inversePatch ?? {}, change.patch ?? {});
  }
  if (!body.children.length) return noChanges();
  return frame;
}

/** 没有任何字段变化时的说明。 */
function noChanges(): HTMLElement {
  const empty = element(
    'p',
    '没有数据变化',
    'rounded-box bg-base-200 px-4 py-6 text-center text-sm text-base-content/70'
  );
  empty.dataset['empty'] = 'true';
  return empty;
}
