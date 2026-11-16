import { Window } from 'happy-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Commit, Records } from '../model.js';
import type { CollaborationController } from './controller.js';
import type { Perform } from './elements.js';
import { PullRequestView } from './pr-view.js';
const records = (name: string): Records => ({ c: { entity: 'AssetCategory', fields: { name } } });
const commit = (id: string, parent: string | null, name: string): Commit => ({
  id,
  parent,
  authorId: 'u1',
  message: id,
  records: records(name)
});
const flush = () => new Promise<void>(resolve => setTimeout(resolve, 0));
beforeEach(() => {
  vi.stubGlobal('document', new Window().document);
});
afterEach(() => {
  vi.unstubAllGlobals();
});
/** 起点、来源、目标对同一字段各改一次，预览里恰有一个字段冲突 c/name。 */
function previewWithConflict() {
  const failures: unknown[] = [];
  const run = vi.fn().mockResolvedValue({});
  const controller = {
    user: { id: 'u1', email: 'u1@example.test', verified: true },
    draft: null,
    run,
    snapshot: {
      head: 'target',
      records: records('Target'),
      policy: { version: 1, stages: [] },
      schemaVersion: 1,
      members: [{ id: 'u1', email: 'u1@example.test', permissions: ['read', 'edit', 'merge'], generation: 1 }],
      tasks: [{ id: 't', name: 'Task', ownerId: 'u1', base: 'base', head: 'source', originTaskId: null }],
      commits: { base: commit('base', null, 'Base'), source: commit('source', 'base', 'Source') },
      prs: [
        {
          id: 'pr',
          taskId: 't',
          authorId: 'u1',
          title: 'Rename',
          description: '',
          target: 'shared',
          status: 'review',
          revision: 3,
          candidateId: null,
          subscribers: []
        }
      ],
      candidates: {},
      reviews: [],
      governance: []
    }
  } as unknown as CollaborationController;
  const perform: Perform = async work => {
    try {
      await work();
    } catch (error) {
      failures.push(error);
    }
  };
  const view = new PullRequestView(controller, perform, () => undefined);
  view.selected = 'pr';
  const root = view.view();
  const control = <T extends Element>(selector: string) => root.querySelector<T>(selector)!;
  const choice = control<HTMLSelectElement>('select[aria-label="冲突处理"]');
  const custom = control<HTMLInputElement>('input[aria-label="自定义结果（JSON 值）"]');
  const submit = [...root.querySelectorAll('button')].find(node => node.textContent === '生成合并候选并检查')!;
  return { run, failures, choice, custom, submit };
}
const candidate = (resolutions: unknown[]) => ({
  type: 'candidate',
  prId: 'pr',
  expectedRevision: 3,
  resolutions
});
describe('三方合并预览的冲突处理', () => {
  it('未处理的冲突不产生选择；采用来源与自定义值按所选方式提交', async () => {
    const { run, failures, choice, custom, submit } = previewWithConflict();
    submit.click();
    await flush();
    expect(run).toHaveBeenLastCalledWith(candidate([]));
    choice.value = 'source';
    submit.click();
    await flush();
    expect(run).toHaveBeenLastCalledWith(candidate([{ key: 'c/name', choice: 'source' }]));
    choice.value = 'custom';
    custom.value = '"Renamed"';
    submit.click();
    await flush();
    expect(run).toHaveBeenLastCalledWith(candidate([{ key: 'c/name', choice: 'custom', value: 'Renamed' }]));
    expect(failures).toEqual([]);
  });

  it('自定义值不是合法 JSON 时，错误进入统一的执行路径显示，且不发出请求', async () => {
    const { run, failures, choice, custom, submit } = previewWithConflict();
    choice.value = 'custom';
    custom.value = '{oops';
    submit.click();
    await flush();
    expect(run).not.toHaveBeenCalled();
    expect(failures).toEqual([expect.objectContaining({ code: 'invalid', message: 'JSON 格式错误' })]);
    custom.value = '';
    submit.click();
    await flush();
    expect(run).not.toHaveBeenCalled();
    expect(failures).toHaveLength(2);
    expect(failures[1]).toMatchObject({ code: 'invalid', message: '自定义冲突值不能为空' });
  });
});
