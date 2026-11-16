import type { DataRow, Records, Value } from '../model.js';
import { canonical } from '../records.js';
import type { CollaborationController } from './controller.js';
import { button, element, input, row, section, select, type Perform } from './elements.js';
import { tx } from './translate.js';
const labels: Record<string, string> = {
  AssetCategory: '分类',
  Asset: '资产',
  AssetEvent: '维护记录',
  name: '名称',
  description: '说明',
  status: '状态',
  purchasePrice: '购入价',
  purchaseDate: '购入日期',
  categoryId: '分类',
  summary: '事项',
  cost: '费用',
  happenedAt: '日期',
  assetId: '所属资产'
};
const fields: Record<DataRow['entity'], string[]> = {
  AssetCategory: ['name', 'description'],
  Asset: ['name', 'status', 'purchasePrice', 'purchaseDate', 'categoryId'],
  AssetEvent: ['summary', 'cost', 'happenedAt', 'assetId']
};
export class TaskEditor {
  private indicator?: HTMLElement;
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
          v0: draft.localHead ?? '空',
          v1: draft.remoteHead ?? '空',
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
    for (const entity of ['AssetCategory', 'Asset', 'AssetEvent'] as const) view.append(this.entityTable(entity));
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
  private entityTable(entity: DataRow['entity']) {
    const view = section(labels[entity]);
    view.append(
      button(tx('新增{v0}', { v0: tx(labels[entity]) }), () => {
        this.buffer[crypto.randomUUID()] = { entity, fields: {} };
        this.mark();
        this.render();
      })
    );
    const table = element('table', '', 'table table-sm');
    const head = element('tr');
    fields[entity].forEach(field => head.append(element('th', labels[field])));
    head.append(element('th', '操作'));
    const thead = element('thead');
    thead.append(head);
    const tbody = element('tbody');
    Object.entries(this.buffer)
      .filter(([, item]) => item.entity === entity)
      .forEach(([id, item]) => tbody.append(this.recordRow(id, item)));
    table.append(thead, tbody);
    const scroll = element('div', '', 'overflow-x-auto');
    scroll.append(table);
    view.append(scroll);
    return view;
  }
  private recordRow(id: string, item: DataRow): HTMLTableRowElement {
    const tr = element('tr');
    for (const field of fields[item.entity]) {
      const cell = element('td');
      const control = this.fieldControl(item, field);
      control.control.dataset['recordId'] = id;
      control.control.addEventListener('change', () => {
        item.fields[field] = fieldValue(field, control.control.value);
        this.mark();
      });
      control.control.addEventListener('input', () => {
        item.fields[field] = fieldValue(field, control.control.value);
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
  private deleteRecord(id: string): void {
    const references = Object.entries(this.buffer)
      .filter(([, record]) => record.fields['categoryId'] === id || record.fields['assetId'] === id)
      .map(([key]) => key);
    delete this.buffer[id];
    references.forEach(key => this.deleteRecord(key));
  }
  private fieldControl(item: DataRow, field: string) {
    const value = item.fields[field] == null ? '' : String(item.fields[field]);
    if (field === 'categoryId' || field === 'assetId') {
      const target = field === 'categoryId' ? 'AssetCategory' : 'Asset';
      return select(
        labels[field],
        [
          { value: '', label: tx('请选择') },
          ...Object.entries(this.buffer)
            .filter(([, data]) => data.entity === target)
            .map(([id, data]) => ({ value: id, label: String(data.fields['name'] ?? id) }))
        ],
        value
      );
    }
    return input(
      labels[field],
      value,
      ['cost', 'purchasePrice'].includes(field) ? 'number'
      : ['happenedAt', 'purchaseDate'].includes(field) ? 'date'
      : 'text'
    );
  }
}
function fieldValue(field: string, value: string): Value {
  if (!value) return null;
  if (['cost', 'purchasePrice'].includes(field)) return Number(value);
  return value;
}
export function readOnlyRecords(records: Records) {
  const table = element('table', '', 'table table-sm');
  const head = element('thead');
  const header = element('tr');
  ['类型', '记录', '数据'].forEach(label => header.append(element('th', label)));
  head.append(header);
  table.append(head);
  const body = element('tbody');
  for (const [id, record] of Object.entries(records)) {
    const item = element('tr');
    item.append(
      element('td', tx(labels[record.entity])),
      element('td', String(record.fields['name'] ?? record.fields['summary'] ?? id)),
      element(
        'td',
        Object.entries(record.fields)
          .map(([field, value]) => `${labels[field] ?? field}：${value ?? '空'}`)
          .join('；')
      )
    );
    body.append(item);
  }
  table.append(body);
  return table;
}
