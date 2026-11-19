import type { DataRow, Records, SchemaManifest, Value } from '../model.js';
import { schemaModel, type EntityModel, type SchemaModel } from '../schema.js';
import { badge, element } from './elements.js';
import { displayValue, entityText, fieldText } from './labels.js';
import { tx } from './translate.js';

/** 记录在界面上的名称：实体标题字段的取值，没有时用记录标识。 */
export const titleOf = (entity: EntityModel | undefined, id: string, row: DataRow) =>
  String((entity?.title === undefined ? undefined : row.fields[entity.title]) ?? id);

/**
 * 单元格里的取值：空值显示「—」，布尔值显示是 / 否，单值关联显示目标记录的名称（同一份记录里找得到时），
 * 只显示日期的日期字段只取日期部分；其余原样（用户数据不经词条表）。
 */
export function cellText(
  schema: SchemaManifest,
  records: Records,
  entity: string,
  field: string,
  value: Value | undefined
): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return tx(value ? '是' : '否');
  const model = schemaModel(schema);
  const relation = model.entity(entity)?.field(field)?.target !== undefined;
  if (relation && typeof value === 'string' && records[value])
    return titleOf(model.entity(records[value].entity), value, records[value]);
  const shown = displayValue(schema, entity, field, value);
  return typeof shown === 'object' ? JSON.stringify(shown) : String(shown);
}

/** 一个实体在表格里的列：标题字段在前，其余按清单顺序，只取这批记录里出现过的字段；不在清单里的字段排在最后。 */
function columns(entity: EntityModel | undefined, rows: readonly DataRow[]): string[] {
  const present = new Set(rows.flatMap(row => Object.keys(row.fields)));
  const declared = entity?.fields.map(field => field.name) ?? [];
  const ordered = [...declared, ...[...present].filter(name => !declared.includes(name)).sort()];
  return ordered.filter(name => present.has(name) && name !== entity?.title);
}

/** 一个实体的记录表：标题行带实体名与条数，第一列是记录名称。 */
function entityTable(
  schema: SchemaManifest,
  model: SchemaModel,
  records: Records,
  entity: string,
  rows: readonly [string, DataRow][]
): HTMLElement {
  const entityModel = model.entity(entity);
  const fields = columns(
    entityModel,
    rows.map(([, row]) => row)
  );
  const group = element('div', '', 'space-y-2');
  group.dataset['entity'] = entity;
  const heading = element('h3', '', 'flex items-center gap-2 text-sm font-semibold');
  heading.append(element('span', entityText(entity)), badge(String(rows.length), 'ghost', true));
  const frame = element('div', '', 'overflow-x-auto rounded-box border border-base-300');
  const table = element('table', '', 'table table-sm');
  const head = element('thead');
  const header = element('tr');
  const titleLabel = entityModel?.title === undefined ? '记录' : fieldText(schema, entity, entityModel.title);
  header.append(element('th', titleLabel));
  for (const field of fields) header.append(element('th', fieldText(schema, entity, field)));
  head.append(header);
  const body = element('tbody');
  for (const [id, row] of rows) {
    const line = element('tr');
    line.dataset['recordId'] = id;
    const name = element('td', titleOf(entityModel, id, row), 'font-medium');
    name.title = id;
    line.append(name);
    for (const field of fields) line.append(element('td', cellText(schema, records, entity, field, row.fields[field])));
    body.append(line);
  }
  table.append(head, body);
  frame.append(table);
  group.append(heading, frame);
  return group;
}

/**
 * 只读记录表（共享数据、提交与候选的内容、匿名导入的预览）：按实体分组，实体按数据模式清单的顺序，每个实体一张表，
 * 字段成列、标签按清单与宿主应用的标签显示，用户数据原样显示。团队任务的编辑不在这里——由应用的模型驱动界面渲染（`renderEditor`）。
 */
export function readOnlyRecords(records: Records, schema: SchemaManifest): HTMLElement {
  const entries = Object.entries(records);
  if (!entries.length) {
    const empty = element(
      'p',
      '暂无记录',
      'rounded-box bg-base-200 px-4 py-6 text-center text-sm text-base-content/70'
    );
    empty.dataset['empty'] = 'true';
    return empty;
  }
  const model = schemaModel(schema);
  const groups = new Map<string, [string, DataRow][]>();
  for (const entry of entries) {
    const rows = groups.get(entry[1].entity);
    if (rows) rows.push(entry);
    else groups.set(entry[1].entity, [entry]);
  }
  const known = model.entities.map(entity => entity.entity);
  const order = [...known, ...[...groups.keys()].filter(name => !known.includes(name)).sort()];
  const container = element('div', '', 'space-y-4');
  for (const entity of order) {
    const rows = groups.get(entity);
    if (rows) container.append(entityTable(schema, model, records, entity, rows));
  }
  return container;
}
