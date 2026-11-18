import { Window } from 'happy-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Records, WorkspaceSummary } from '../model.js';
import { assetSchema } from '../schema.testing.js';
import type { CollaborationController } from './controller.js';
import type { Perform } from './elements.js';
import { importLimit } from './import-anonymous.js';
import { importPreview, noTaskNotice, sharedPanel, tasksPanel } from './workspace-view.js';

let window: Window;
beforeEach(() => {
  window = new Window();
  vi.stubGlobal('document', window.document);
  vi.stubGlobal('KeyboardEvent', window.KeyboardEvent);
  window.HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
});
afterEach(() => {
  vi.unstubAllGlobals();
});
const alice = { id: 'alice', email: 'alice@example.test', verified: true };
function setup(options: { permissions?: string[]; head?: string; earlier?: boolean; current?: string } = {}) {
  const snapshot = {
    name: '团队甲',
    root: 'root',
    head: options.head ?? 'root',
    members: [{ id: 'alice', email: alice.email, permissions: options.permissions ?? ['read', 'edit'] }],
    tasks: [
      { id: 't1', name: '较早的任务', ownerId: 'alice' },
      { id: 'tx', name: '别人的任务', ownerId: 'bob' },
      { id: 't2', name: '新的任务', ownerId: 'alice' }
    ],
    earlier: { prs: false, tasks: options.earlier ?? false, notices: false }
  } as unknown as WorkspaceSummary;
  const controller = {
    user: alice,
    snapshot,
    task: options.current ? { context: { taskId: options.current } } : null,
    createTask: vi.fn(async () => undefined),
    openTask: vi.fn(async () => undefined),
    loadEarlierTasks: vi.fn(async () => undefined),
    sharedRecords: vi.fn((): Records | undefined => undefined),
    schema: () => assetSchema,
    loadSchema: vi.fn(async () => assetSchema),
    loadSharedRecords: vi.fn(async (): Promise<Records> => ({})),
    importRecords: vi.fn(async () => undefined)
  };
  const perform: Perform = async work => {
    await work();
  };
  const button = (root: ParentNode, name: string) =>
    [...root.querySelectorAll('button')].find(node => node.textContent === name);
  return { controller, view: controller as unknown as CollaborationController, perform, button };
}

describe('工作区左栏「我的任务」', () => {
  it('按输入的名称新建任务，回车与点击都可以', async () => {
    const { view, controller, perform, button } = setup();
    const panel = tasksPanel(view, perform);
    const name = panel.querySelector<HTMLInputElement>('input[aria-label="任务名称"]')!;
    name.value = '采购电脑';
    button(panel, '新建任务')!.click();
    await vi.waitFor(() => expect(controller.createTask).toHaveBeenCalledWith('采购电脑'));
    // 上一次点击执行完、按钮恢复可用之后再按回车
    await vi.waitFor(() => expect(button(panel, '新建任务')!.disabled).toBe(false));
    name.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await vi.waitFor(() => expect(controller.createTask).toHaveBeenCalledTimes(2));
  });
  it('只列出本人的任务，新的在上；打开着的那个标为当前；点击打开任务', async () => {
    const { view, controller, perform } = setup({ current: 't1' });
    const items = [...tasksPanel(view, perform).querySelectorAll<HTMLButtonElement>('ul button')];
    expect(items.map(node => node.getAttribute('aria-label'))).toEqual(['打开任务：新的任务', '打开任务：较早的任务']);
    expect(items.map(node => node.getAttribute('aria-current'))).toEqual([null, 'true']);
    items[0].click();
    await vi.waitFor(() => expect(controller.openTask).toHaveBeenCalledWith('t2'));
  });
  it('有更早的任务时提供加载入口；应用提供匿名库读取时才有导入入口', async () => {
    const { view, controller, perform, button } = setup({ earlier: true });
    const importAnonymous = vi.fn(async () => undefined);
    const panel = tasksPanel(view, perform, importAnonymous);
    button(panel, '加载更早的任务')!.click();
    await vi.waitFor(() => expect(controller.loadEarlierTasks).toHaveBeenCalledTimes(1));
    button(panel, '预览匿名数据导入')!.click();
    await vi.waitFor(() => expect(importAnonymous).toHaveBeenCalledTimes(1));
    expect(button(tasksPanel(view, perform), '预览匿名数据导入')).toBeUndefined();
  });
});

describe('工作区主栏', () => {
  it('没有打开的任务：有编辑权限时引导新建或打开，没有编辑权限的成员看到权限说明', () => {
    expect(noTaskNotice(setup().view).textContent).toContain('还没有打开的任务');
    expect(noTaskNotice(setup({ permissions: ['read'] }).view).textContent).toContain('没有「编辑与提交」权限');
  });
  it('共享数据：团队名、共享版本（还没有合并时是空分支）与只读标记；记录读到之前显示占位', () => {
    const { view, controller } = setup();
    let panel = sharedPanel(view);
    expect(panel.querySelector('h2')?.textContent).toBe('共享数据 · 团队甲');
    expect(panel.textContent).toContain('共享版本：空分支 · 默认只读');
    expect(panel.querySelector('[data-loading]')).not.toBeNull();
    controller.sharedRecords.mockReturnValue({ c: { entity: 'AssetCategory', fields: { name: '电脑' } } });
    panel = sharedPanel(view);
    expect(panel.querySelector('[data-loading]')).toBeNull();
    expect(panel.querySelector('table')?.textContent).toContain('电脑');
    const merged = sharedPanel(setup({ head: '01970a3b-0000-7000-8000-00000000abcd' }).view);
    expect(merged.textContent).toContain('共享版本：0000abcd · 默认只读');
    expect(merged.dataset['sharedHead']).toBe('01970a3b-0000-7000-8000-00000000abcd');
  });
});

describe('预览匿名数据导入', () => {
  const local: Records = {
    a: { entity: 'AssetCategory', fields: { name: '匿名分类' } },
    b: { entity: 'AssetCategory', fields: { name: '匿名分类' } }
  };
  it('对话框列出条数、同 ID 记录与冲突，确认后按填写的任务名复制到新任务', async () => {
    const { view, controller, perform } = setup();
    controller.loadSharedRecords.mockResolvedValue({ a: { entity: 'AssetCategory', fields: { name: '共享' } } });
    await importPreview(view, perform, async () => local);
    const dialog = document.querySelector('dialog')!;
    expect(dialog.textContent).toContain('将 2 条本机记录复制到 团队甲 的新任务');
    expect(dialog.textContent).toContain('同 ID 记录 1 条');
    expect(dialog.textContent).toContain('同 ID 记录将采用本机内容：a');
    dialog.querySelector<HTMLInputElement>('input[aria-label="导入任务名称"]')!.value = '整理分类';
    [...dialog.querySelectorAll('button')].find(node => node.textContent === '确认复制到新任务')!.click();
    await vi.waitFor(() => expect(controller.importRecords).toHaveBeenCalledWith('整理分类', local, assetSchema));
    expect(document.querySelector('dialog')).toBeNull();
  });
  it('超过单个提交的上限时说明原因，不能确认', async () => {
    const { view, perform } = setup();
    const many: Records = Object.fromEntries(
      Array.from({ length: importLimit + 1 }, (_, index) => [
        `r${index}`,
        { entity: 'AssetCategory', fields: { name: `分类 ${index}` } }
      ])
    );
    await importPreview(view, perform, async () => many);
    const dialog = document.querySelector('dialog')!;
    expect(dialog.textContent).toContain('本机记录超过单个提交的上限');
    const confirm = [...dialog.querySelectorAll('button')].find(node => node.textContent === '确认复制到新任务')!;
    expect(confirm.disabled).toBe(true);
  });
});
