import type { DataRow, Records, SchemaManifest, Value } from '../model.js';
import { canonical } from '../records.js';
import { schemaModel, type EntityModel, type RecordField } from '../schema.js';
import type { CollaborationController } from './controller.js';
import { button, element, input, row, section, select, type Perform } from './elements.js';
import { entityText, fieldText } from './labels.js';
import { tx } from './translate.js';

/** 数值类字段：输入框用 number，保存时转成数字。 */
const numeric = (field: RecordField) => ['number', 'integer'].includes(field.descriptor.valueType);
/** 字段对应的输入框类型：数值、日期，其余为文本。 */
const inputType = (field: RecordField) =>
  numeric(field) ? 'number'
  : field.descriptor.valueType === 'date' ? 'date'
  : 'text';
/** 记录在界面上的名称：实体标题字段的取值，没有时用记录标识。 */
const titleOf = (entity: EntityModel | undefined, id: string, row: DataRow) =>
  String((entity?.title === undefined ? undefined : row.fields[entity.title]) ?? id);

/**
 * 任务草稿的编辑器：按草稿的数据模式清单逐个实体列出记录表（清单顺序），字段、输入框类型与关联下拉都来自清单，
 * 标签由宿主应用提供（见 `labels.ts`）。协作包本身不认识任何具体实体。
 */
export class TaskEditor {
  private indicator?: HTMLElement;
  /** 当前草稿的数据模式清单：编辑器只在草稿打开时渲染。 */
  private get schema(): SchemaManifest {
    return this.controller.draft!.schema;
  }
  buffer: Records = {};
  taskId: string | null = null;
  dirty = false;
  constructor(
    private readonly controller: CollaborationController,
    private readonly perform: Perform,
    private readonly render: () => void
  ) {}
  bind() {
    const draft = this.controller.draft;
    if (draft?.context.taskId !== this.taskId || !this.dirty) {
      this.buffer = structuredClone(draft?.records ?? {});
      this.taskId = draft?.context.taskId ?? null;
      this.dirty = false;
    }
  }
  clear() {
    this.taskId = null;
    this.buffer = {};
    this.dirty = false;
  }
  view(): HTMLElement {
    this.bind();
    const draft = this.controller.draft!;
    const view = section(tx('任务：{v0}', { v0: draft.name }));
    this.indicator = element('p', this.dirty ? tx('有未保存输入') : tx('所有输入已保存到本机'));
    this.indicator.setAttribute('role', 'status');
    view.append(this.indicator);
    const unsynced = canonical(draft.records) !== canonical(draft.committed);
    view.append(
      element(
        'p',
        tx('本地版本：{v0} · 远端确认：{v1} · 待上传提交：{v2} · 已保存未提交：{v3}', {
          v0: draft.localHead ?? tx('空'),
          v1: draft.remoteHead ?? tx('空'),
          v2: draft.queue.length,
          v3: unsynced ? tx('有') : tx('无')
        }),
        'text-xs break-all'
      )
    );
    const actions = row();
    actions.append(
      button('保存全部', () => this.perform(() => this.save())),
      button('同步', () => this.syncDialog(), this.controller.syncing)
    );
    // 队首待上传提交已超过自动重试期限：同步不会自动重发，用户核对远端版本后在这里确认
    if (this.controller.uploadExpired())
      actions.append(
        button(
          '确认同步过期提交',
          () => this.perform(() => this.controller.sync(this.dirty, true)),
          this.controller.syncing
        )
      );
    const name = input('另存任务名称', tx('{v0}（分叉）', { v0: draft.name }));
    actions.append(
      name.wrapper,
      button(
        '另存为新任务',
        () =>
          this.perform(async () => {
            await this.controller.fork(name.control.value, this.dirty);
            this.clear();
          }),
        !this.controller.online
      )
    );
    const remote = this.controller.snapshot?.tasks.find(t => t.id === draft.context.taskId);
    if (remote && remote.head !== draft.remoteHead)
      actions.append(button('拉取远端版本', () => this.perform(() => this.controller.fetchRemote(this.dirty))));
    view.append(actions);
    for (const entity of schemaModel(draft.schema).entities) view.append(this.entityTable(entity));
    return view;
  }
  async save() {
    await this.controller.save(this.buffer);
    this.dirty = false;
    this.render();
  }
  async checkpoint(): Promise<void> {
    if (!this.dirty || !this.controller.draft) return;
    await this.controller.save(this.buffer);
    this.dirty = false;
  }
  private mark() {
    this.dirty = true;
    if (this.indicator) this.indicator.textContent = tx('有未保存输入');
  }
  private syncDialog(): void {
    if (!this.dirty) {
      void this.perform(() => this.controller.sync(false));
      return;
    }
    const dialog = element('dialog', '', 'modal');
    const box = element('div', '', 'modal-box space-y-4');
    box.append(
      element('h2', '同步前需要保存全部输入', 'font-semibold'),
      element('p', '当前未保存输入尚未进入工作树。保存全部后会生成整单提交。')
    );
    const actions = row();
    actions.append(
      button('取消同步', () => {
        dialog.close();
        dialog.remove();
      }),
      button('保存全部并同步', () => {
        dialog.close();
        dialog.remove();
        return this.perform(async () => {
          await this.save();
          await this.controller.sync(false);
        });
      })
    );
    box.append(actions);
    dialog.append(box);
    document.body.append(dialog);
    dialog.addEventListener('cancel', () => dialog.remove());
    dialog.showModal();
  }
  private entityTable(entity: EntityModel) {
    const label = entityText(entity.entity);
    const view = section(label);
    view.append(
      button(tx('新增{v0}', { v0: tx(label) }), () => {
        this.buffer[crypto.randomUUID()] = { entity: entity.entity, fields: {} };
        this.mark();
        this.render();
      })
    );
    const table = element('table', '', 'table table-sm');
    const head = element('tr');
    entity.fields.forEach(field => head.append(element('th', fieldText(this.schema, entity.entity, field.name))));
    head.append(element('th', '操作'));
    const thead = element('thead');
    thead.append(head);
    const tbody = element('tbody');
    Object.entries(this.buffer)
      .filter(([, item]) => item.entity === entity.entity)
      .forEach(([id, item]) => tbody.append(this.recordRow(id, item, entity)));
    table.append(thead, tbody);
    const scroll = element('div', '', 'overflow-x-auto');
    scroll.append(table);
    view.append(scroll);
    return view;
  }
  private recordRow(id: string, item: DataRow, entity: EntityModel): HTMLTableRowElement {
    const tr = element('tr');
    for (const field of entity.fields) {
      const cell = element('td');
      const control = this.fieldControl(item, entity, field);
      control.control.dataset['recordId'] = id;
      control.control.addEventListener('change', () => {
        item.fields[field.name] = fieldValue(field, control.control.value);
        this.mark();
      });
      control.control.addEventListener('input', () => {
        item.fields[field.name] = fieldValue(field, control.control.value);
        this.mark();
      });
      cell.append(control.wrapper);
      tr.append(cell);
    }
    const action = element('td');
    action.append(
      button('删除（含关联记录）', () => {
        this.deleteRecord(id);
        this.mark();
        this.render();
      })
    );
    tr.append(action);
    return tr;
  }
  /** 删除一条记录，连同按单值关联引用它的记录（递归）。 */
  private deleteRecord(id: string): void {
    const model = schemaModel(this.schema);
    const references = Object.entries(this.buffer)
      .filter(([, record]) =>
        model
          .entity(record.entity)
          ?.fields.some(field => field.target !== undefined && record.fields[field.name] === id)
      )
      .map(([key]) => key);
    delete this.buffer[id];
    references.forEach(key => this.deleteRecord(key));
  }
  private fieldControl(item: DataRow, entity: EntityModel, field: RecordField) {
    const value = item.fields[field.name] == null ? '' : String(item.fields[field.name]);
    const label = fieldText(this.schema, entity.entity, field.name);
    if (field.target === undefined) return input(label, value, inputType(field));
    const target = schemaModel(this.schema).entity(field.target);
    return select(
      label,
      [
        { value: '', label: tx('请选择') },
        ...Object.entries(this.buffer)
          .filter(([, data]) => data.entity === field.target)
          .map(([id, data]) => ({ value: id, label: titleOf(target, id, data) }))
      ],
      value
    );
  }
}
/** 输入框的文本换成记录取值：空输入为 null，数值字段转成数字，其余保持文本。 */
function fieldValue(field: RecordField, value: string): Value {
  if (!value) return null;
  return numeric(field) ? Number(value) : value;
}
/** 只读记录表：类型、记录名称与各字段取值，标签按数据模式清单与宿主应用的标签显示，用户数据原样显示。 */
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
          .map(([field, value]) => `${tx(fieldText(schema, record.entity, field))}：${value ?? tx('空')}`)
          .join('；')
      )
    );
    body.append(item);
  }
  table.append(body);
  return table;
}
