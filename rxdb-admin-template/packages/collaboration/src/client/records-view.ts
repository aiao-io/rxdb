import type { DataRow, Records, SchemaManifest } from '../model.js';
import { schemaModel, type EntityModel } from '../schema.js';
import { element } from './elements.js';
import { displayValue, entityText, fieldText } from './labels.js';
import { tx } from './translate.js';

/** 记录在界面上的名称：实体标题字段的取值，没有时用记录标识。 */
const titleOf = (entity: EntityModel | undefined, id: string, row: DataRow) =>
  String((entity?.title === undefined ? undefined : row.fields[entity.title]) ?? id);

/**
 * 只读记录表（共享数据、提交与候选的内容、匿名导入的预览）：类型、记录名称与各字段取值，标签按数据模式清单与宿主应用的标签显示，
 * 用户数据原样显示。团队任务的编辑不在这里——由应用的模型驱动界面渲染（`renderEditor`）。
 */
export function readOnlyRecords(records: Records, schema: SchemaManifest) {
  const table = element('table', '', 'table table-sm');
  const head = element('thead');
  const header = element('tr');
  ['类型', '记录', '数据'].forEach(label => header.append(element('th', label)));
  head.append(header);
  table.append(head);
  const body = element('tbody');
  const model = schemaModel(schema);
  for (const [id, record] of Object.entries(records)) {
    const item = element('tr');
    item.append(
      element('td', tx(entityText(record.entity))),
      element('td', titleOf(model.entity(record.entity), id, record)),
      element(
        'td',
        Object.entries(record.fields)
          .map(
            ([field, value]) =>
              `${tx(fieldText(schema, record.entity, field))}：${displayValue(schema, record.entity, field, value) ?? tx('空')}`
          )
          .join('；')
      )
    );
    body.append(item);
  }
  table.append(body);
  return table;
}
