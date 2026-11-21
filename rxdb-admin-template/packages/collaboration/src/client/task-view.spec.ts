import { Window } from 'happy-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceSummary } from '../model.js';
import type { Disclosures } from './disclosure.js';
import type { Perform } from './elements.js';
import { taskView, type TaskPrActions, type TaskViewController } from './task-view.js';
import type { TaskView } from './team-tasks.js';
import { useTranslation } from './translate.js';

let window: Window;
beforeEach(() => {
  window = new Window();
  vi.stubGlobal('document', window.document);
  window.HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
});
afterEach(() => {
  useTranslation(undefined);
  vi.unstubAllGlobals();
});
const root = 'root';
function open(overrides: Partial<TaskView> = {}): TaskView {
  return {
    context: { userId: 'alice', teamId: 'team', appId: 'assets', taskId: 'task' },
    name: '采购',
    base: root,
    branchId: 'task/task/1',
    remoteHead: root,
    localHead: root,
    saved: 0,
    restoring: false,
    commits: [],
    unpushed: 0,
    uploads: [],
    ...overrides
  };
}
function setup(
  task: TaskView,
  options: {
    expired?: boolean;
    online?: boolean;
    remoteHead?: string;
    open?: boolean;
    unsaved?: boolean;
    pr?: TaskPrActions;
  } = {}
) {
  const controller = {
    task,
    user: { id: 'alice', email: 'alice@example.test', verified: true },
    snapshot: {
      root,
      tasks: [
        {
          id: 'task',
          name: task.name,
          ownerId: 'alice',
          base: root,
          head: options.remoteHead ?? task.remoteHead,
          originTaskId: null
        }
      ]
    } as unknown as WorkspaceSummary,
    syncing: false,
    online: options.online ?? true,
    unsavedInput: options.unsaved ?? false,
    uploadExpired: () => options.expired ?? false,
    sync: vi.fn(async () => undefined),
    discardDraft: vi.fn(async () => undefined),
    fork: vi.fn(async () => undefined),
    fetchRemote: vi.fn(async () => undefined)
  } satisfies TaskViewController;
  const perform: Perform = async work => {
    await work();
  };
  const disclosures: Disclosures = { isOpen: () => options.open ?? false, reveal: () => undefined };
  const view = taskView(controller, perform, disclosures, options.pr);
  const buttons = (name: string) => [...view.querySelectorAll('button')].filter(node => node.textContent === name);
  const texts = () => [...view.querySelectorAll('p')].map(node => node.textContent);
  return { controller, view, buttons, texts };
}

describe('任务视图把已保存未提交、已提交未同步与已同步分开显示（ADMIN-US-205 AC#3～5）', () => {
  it('工作树有条目：已保存未提交，详情行标「有」，可以放弃草稿', () => {
    const { view, texts, buttons } = setup(open({ saved: 2 }));
    expect(view.querySelector('[role="status"]')?.textContent).toBe('有已保存未提交的改动（2 项）');
    expect(view.querySelector<HTMLElement>('[data-task-state]')?.dataset['taskState']).toBe('saved');
    expect(texts()).toContain('本地版本：空 · 远端确认：空 · 待上传提交：0 · 已保存未提交：有');
    expect(texts()).toContain('表单里的输入点「保存」之后才进入任务工作树；同步只提交已保存的改动');
    expect(buttons('放弃草稿')).toHaveLength(1);
  });
  it('工作树干净、远端头之后还有本机提交：已提交未同步，没有可放弃的草稿', () => {
    const { view, texts, buttons } = setup(open({ localHead: 'c1', unpushed: 1 }));
    expect(view.querySelector('[role="status"]')?.textContent).toBe('有已提交未同步的提交（1 个）');
    expect(view.querySelector<HTMLElement>('[data-task-state]')?.dataset['taskState']).toBe('committed');
    expect(texts()).toContain('本地版本：c1 · 远端确认：空 · 待上传提交：1 · 已保存未提交：无');
    expect(buttons('放弃草稿')).toHaveLength(0);
  });
  it('工作树干净、没有未同步提交：已同步', () => {
    const { view } = setup(open({ localHead: 'c1', remoteHead: 'c1' }));
    expect(view.querySelector('[role="status"]')?.textContent).toBe('已同步：本机与远端确认的版本一致');
    expect(view.querySelector<HTMLElement>('[data-task-state]')?.dataset['taskState']).toBe('synced');
  });
  it('来自历史恢复的工作树单独标出，恢复会话期间也能放弃', () => {
    const { texts, buttons } = setup(open({ saved: 1, restoring: true }));
    expect(texts()).toContain('工作树来自历史版本的恢复，同步后形成新的提交');
    expect(buttons('放弃草稿')).toHaveLength(1);
  });
  it('编辑界面里有未保存的输入时另起一行标出，三种状态照常显示：未保存的输入与已保存的工作树分开（AC#5）', () => {
    const { view } = setup(open({ saved: 2 }), { unsaved: true });
    const unsaved = view.querySelector<HTMLElement>('[data-unsaved-input]');
    expect(unsaved?.textContent).toBe('有未保存的输入：先在编辑界面里保存或取消，才能同步或切换任务');
    expect(unsaved?.getAttribute('role')).toBe('status');
    expect(view.querySelector<HTMLElement>('[data-task-state]')?.textContent).toBe('有已保存未提交的改动（2 项）');
    expect(view.querySelector<HTMLElement>('[data-task-state]')?.dataset['taskState']).toBe('saved');

    const synced = setup(open({ localHead: 'c1', remoteHead: 'c1' }), { unsaved: true });
    expect(synced.view.querySelector('[data-unsaved-input]')).not.toBeNull();
    expect(synced.view.querySelector<HTMLElement>('[data-task-state]')?.dataset['taskState']).toBe('synced');
  });
  it('没有未保存的输入时不显示那一行', () => {
    expect(setup(open({ saved: 1 })).view.querySelector('[data-unsaved-input]')).toBeNull();
  });
  it('产品文案经词条表翻译，任务名与提交 ID 原样显示', () => {
    useTranslation(key => `<${key.replace('collaboration.', '')}>`);
    const { view } = setup(open({ saved: 1 }));
    expect(view.querySelector('h2')?.textContent).toBe('<任务：{v0}>');
    expect(view.querySelector('[role="status"]')?.textContent).toBe('<有已保存未提交的改动（{v0} 项）>');
  });
});

describe('任务视图的动作', () => {
  it('同步按当前状态发起；待确认的上传过期时另给「确认同步过期提交」，点击按用户确认同步', async () => {
    const fresh = setup(open({ unpushed: 1, localHead: 'c1' }));
    expect(fresh.buttons('确认同步过期提交')).toHaveLength(0);
    fresh.buttons('同步')[0].click();
    await vi.waitFor(() => expect(fresh.controller.sync).toHaveBeenCalledWith());
    const expired = setup(open({ unpushed: 1, localHead: 'c1' }), { expired: true });
    expired.buttons('确认同步过期提交')[0].click();
    await vi.waitFor(() => expect(expired.controller.sync).toHaveBeenCalledWith(true));
  });
  it('放弃草稿先确认：取消什么都不做，确认之后才放弃', async () => {
    const { buttons, controller } = setup(open({ saved: 1 }));
    buttons('放弃草稿')[0].click();
    const dialog = () => document.querySelector('dialog');
    expect(dialog()?.textContent).toContain('列表与表单回到任务上次提交的版本');
    [...dialog()!.querySelectorAll('button')].find(node => node.textContent === '取消')!.click();
    await vi.waitFor(() => expect(dialog()).toBeNull());
    expect(controller.discardDraft).not.toHaveBeenCalled();
    buttons('放弃草稿')[0].click();
    [...dialog()!.querySelectorAll('button')].find(node => node.textContent === '确认放弃')!.click();
    await vi.waitFor(() => expect(controller.discardDraft).toHaveBeenCalledTimes(1));
  });
  it('另存为新任务在对话框里填名称，带上输入的名称另存；离线时不可用；远端头与本机确认的不同才提供拉取远端版本', async () => {
    const { buttons, controller } = setup(open({ remoteHead: 'c1', localHead: 'c2', unpushed: 1 }), {
      remoteHead: 'c9'
    });
    buttons('另存为新任务…')[0].click();
    await vi.waitFor(() => expect(document.querySelector('dialog')).not.toBeNull());
    const dialog = document.querySelector('dialog')!;
    const name = dialog.querySelector<HTMLInputElement>('input[aria-label="另存任务名称"]')!;
    expect(name.value).toBe('采购（分叉）');
    name.value = '保留本机';
    [...dialog.querySelectorAll('button')].find(node => node.textContent === '另存为新任务')!.click();
    await vi.waitFor(() => expect(controller.fork).toHaveBeenCalledWith('保留本机'));
    expect(document.querySelector('dialog')).toBeNull();
    buttons('拉取远端版本')[0].click();
    await vi.waitFor(() => expect(controller.fetchRemote).toHaveBeenCalledTimes(1));
    expect(setup(open(), { online: false }).buttons('另存为新任务…')[0].disabled).toBe(true);
    expect(setup(open()).buttons('拉取远端版本')).toHaveLength(0);
  });
  it('挂载方给出创建入口时显示「创建 PR…」；任务已有进行中的 PR 时改为「查看 PR」；都不给时两者都没有', async () => {
    const createPr = vi.fn();
    const showPr = vi.fn();
    const creatable = setup(open(), { pr: { createPr } });
    expect(creatable.buttons('查看 PR')).toHaveLength(0);
    creatable.buttons('创建 PR…')[0].click();
    await vi.waitFor(() => expect(createPr).toHaveBeenCalledTimes(1));
    const existing = setup(open(), { pr: { createPr, showPr, openPr: { id: 'p1', title: '采购' } } });
    expect(existing.buttons('创建 PR…')).toHaveLength(0);
    existing.buttons('查看 PR')[0].click();
    await vi.waitFor(() => expect(showPr).toHaveBeenCalledWith('p1'));
    const none = setup(open());
    expect([...none.buttons('创建 PR…'), ...none.buttons('查看 PR')]).toHaveLength(0);
  });
  it('有要同步的内容时「同步」是主按钮，已同步时是普通按钮', () => {
    const tone = (task: TaskView) => setup(task).buttons('同步')[0].classList.contains('btn-primary');
    expect(tone(open({ saved: 1 }))).toBe(true);
    expect(tone(open({ localHead: 'c1', unpushed: 1 }))).toBe(true);
    expect(tone(open({ localHead: 'c1', remoteHead: 'c1' }))).toBe(false);
  });
});

describe('本机提交历史（ADMIN-US-221 AC#1）', () => {
  it('展开后从新到旧列出共同起点之后的本机提交：消息、作者、ID、第一父与同步状态', () => {
    const commits = [
      { id: 'c2', parentId: 'c1', authorId: 'alice', message: '采购', synced: false },
      { id: 'c1', parentId: root, authorId: 'alice', message: '采购', synced: true }
    ];
    const collapsed = setup(open({ commits, localHead: 'c2', remoteHead: 'c1', unpushed: 1 }));
    expect(collapsed.view.querySelector('summary')?.textContent).toBe('本机提交历史（2 个）');
    expect(collapsed.view.querySelector('[data-commit-id]')).toBeNull();
    const expanded = setup(open({ commits, localHead: 'c2', remoteHead: 'c1', unpushed: 1 }), { open: true });
    const items = [...expanded.view.querySelectorAll<HTMLElement>('[data-commit-id]')];
    expect(items.map(node => [node.dataset['commitId'], node.dataset['authorId']])).toEqual([
      ['c2', 'alice'],
      ['c1', 'alice']
    ]);
    // 每项：提交消息、作者（显示成员邮箱）、短 ID、第一父（共享分支根显示「空」）与同步状态
    expect(items[0].textContent).toBe('采购alice@example.testc2父提交：c1待上传');
    expect(items[1].textContent).toBe('采购alice@example.testc1父提交：空已同步');
  });
});
