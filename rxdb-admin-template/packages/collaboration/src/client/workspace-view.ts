import { checkRecords } from '../checks.js';
import type { Records, SchemaManifest } from '../model.js';
import type { CollaborationController } from './controller.js';
import {
  alert,
  badge,
  button,
  element,
  emptyState,
  input,
  loading,
  modal,
  modalActions,
  section,
  type Perform
} from './elements.js';
import { shortId } from './format.js';
import { icon } from './icons.js';
import { importLimit } from './import-anonymous.js';
import { readOnlyRecords } from './records-view.js';
import { tx } from './translate.js';

/** 当前用户在当前团队是否有某项权限。 */
export function hasPermission(
  controller: Pick<CollaborationController, 'snapshot' | 'user'>,
  permission: string
): boolean {
  return !!controller.snapshot?.members
    .find(member => member.id === controller.user?.id)
    ?.permissions.some(item => item === permission);
}

/**
 * 工作区左栏「我的任务」：新建任务（基于当前共享版本）、本人的任务列表（新的在上，打开着的那个高亮）、更早的任务与匿名数据导入。
 * 只有有编辑权限的成员才有这一栏。
 * @param importAnonymous 预览匿名数据导入；应用没提供匿名库读取时为 undefined，不显示入口。
 */
export function tasksPanel(
  controller: CollaborationController,
  perform: Perform,
  importAnonymous?: () => Promise<void>
): HTMLElement {
  const data = controller.snapshot!;
  const panel = section('我的任务', {
    icon: 'git-branch',
    description: '任务是共享数据的分支，审核合并后才进入共享数据'
  });
  const name = input('任务名称', '', 'text', { placeholder: '例如：采购电脑' });
  const create = button('新建任务', () => perform(() => controller.createTask(name.control.value)), false, {
    tone: 'primary',
    icon: 'plus'
  });
  name.control.addEventListener('keydown', event => {
    if (event.key === 'Enter') create.click();
  });
  panel.append(name.wrapper, create);
  create.classList.add('w-full');
  const mine = data.tasks.filter(task => task.ownerId === controller.user?.id);
  if (mine.length) {
    const list = element('ul', '', 'menu w-full gap-0.5 p-0');
    for (const task of [...mine].reverse()) {
      const current = controller.task?.context.taskId === task.id;
      const node = element('button', '', current ? 'menu-active' : '');
      node.type = 'button';
      node.setAttribute('aria-label', tx('打开任务：{v0}', { v0: task.name }));
      if (current) node.setAttribute('aria-current', 'true');
      node.append(icon('git-branch'), element('span', task.name, 'min-w-0 flex-1 truncate', true));
      node.addEventListener('click', () => void perform(() => controller.openTask(task.id)));
      const item = element('li');
      item.append(node);
      list.append(item);
    }
    panel.append(list);
  } else panel.append(element('p', '还没有任务：新建一个任务开始修改', 'text-sm text-base-content/70'));
  if (data.earlier.tasks)
    panel.append(
      button('加载更早的任务', () => perform(() => controller.loadEarlierTasks()), false, {
        tone: 'ghost',
        size: 'xs'
      })
    );
  if (importAnonymous)
    panel.append(
      button('预览匿名数据导入', () => perform(importAnonymous), false, {
        tone: 'ghost',
        icon: 'import',
        className: 'w-full justify-start'
      })
    );
  return panel;
}

/** 工作区主栏在没有打开任务时的提示：有编辑权限就引导新建或打开任务，否则说明只读。 */
export function noTaskNotice(controller: CollaborationController): HTMLElement {
  if (!hasPermission(controller, 'edit'))
    return alert(
      '你在这个团队没有「编辑与提交」权限：可以浏览共享数据与历史、参与数据 PR；修改数据需要管理员授予该权限',
      'info'
    );
  return emptyState(
    'git-branch',
    '还没有打开的任务',
    '在左侧新建任务或打开已有任务。修改先保存在任务里，同步并发起数据 PR，审核合并后才进入共享数据。'
  );
}

/**
 * 共享数据（默认只读）：当前共享版本（还没有任何合并时是「空分支」）与按实体分组的记录表；内容按需读取，读到之前显示占位。
 */
export function sharedPanel(controller: CollaborationController): HTMLElement {
  const data = controller.snapshot!;
  const shared = controller.sharedRecords();
  const schema = controller.schema();
  // 头还是共享分支根：还没有任何合并
  const version = data.head === data.root ? tx('空分支') : shortId(data.head);
  const panel = section(tx('共享数据 · {v0}', { v0: data.name }), {
    icon: 'database',
    description: tx('共享版本：{v0} · 默认只读', { v0: version }),
    actions: [badge('只读', 'ghost')]
  });
  panel.dataset['sharedHead'] = data.head;
  panel.append(shared && schema ? readOnlyRecords(shared, schema) : loading());
  return panel;
}

/**
 * 预览匿名数据导入：数量、同 ID 记录与完整性冲突，确认后复制到新任务的工作树（不提交、不上传）。
 * 记录数超过单个提交的变更上限时不能确认：工作树一次提交整棵，超过的同步不上去。
 * @param read 读取匿名本机库里属于工作区数据模式清单的全部记录（只读）。
 */
export async function importPreview(
  controller: CollaborationController,
  perform: Perform,
  read: (schema: SchemaManifest) => Promise<Records>
): Promise<void> {
  const schema = await controller.loadSchema();
  const records = await read(schema);
  const shared = await controller.loadSharedRecords();
  const data = controller.snapshot!;
  const count = Object.keys(records).length;
  const collisions = Object.keys(records).filter(id => Object.hasOwn(shared, id));
  const checks = checkRecords(schema, { ...shared, ...records });
  const { dialog, box, close } = modal('预览匿名数据导入', {
    icon: 'import',
    description: '原匿名库保持原样；导入不会直接同步或修改共享数据。',
    wide: true
  });
  const stats = element('div', '', 'flex flex-wrap gap-2');
  stats.append(
    badge(tx('本机记录 {v0} 条', { v0: count }), 'neutral', true),
    badge(tx('同 ID 记录 {v0} 条', { v0: collisions.length }), collisions.length ? 'warning' : 'ghost', true),
    badge(tx('冲突 {v0} 条', { v0: checks.length }), checks.length ? 'error' : 'ghost', true)
  );
  box.append(
    element('p', tx('将 {v0} 条本机记录复制到 {v1} 的新任务', { v0: count, v1: data.name }), 'font-medium', true),
    stats
  );
  if (collisions.length || checks.length) {
    const issues = element('ul', '', 'max-h-40 space-y-1 overflow-auto rounded-box bg-base-200 p-3 text-sm');
    collisions.forEach(id =>
      issues.append(element('li', tx('同 ID 记录将采用本机内容：{v0}', { v0: id }), 'break-all', true))
    );
    checks.forEach(check =>
      issues.append(element('li', `${check.recordId} / ${check.field}：${tx(check.message)}`, 'break-all', true))
    );
    box.append(issues);
  }
  if (count > importLimit)
    box.append(
      alert(tx('本机记录超过单个提交的上限（{v0} 条），请先在本机工作台分批整理后再导入', { v0: importLimit }), 'error')
    );
  const table = element('div', '', 'max-h-80 overflow-auto rounded-box border border-base-300');
  table.append(readOnlyRecords(records, schema));
  const name = input('导入任务名称', '导入本机资产');
  box.append(
    table,
    name.wrapper,
    modalActions(
      button('取消', close, false, { tone: 'ghost' }),
      button(
        '确认复制到新任务',
        () => {
          close();
          return perform(() => controller.importRecords(name.control.value, records, schema));
        },
        count > importLimit,
        { tone: 'primary', icon: 'import' }
      )
    )
  );
  dialog.showModal();
}
