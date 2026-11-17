import { Window } from 'happy-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CollaborationController } from './controller.js';
import { readOnlyRecords, TaskEditor } from './editor.js';
import type { Perform } from './elements.js';
import { useTranslation } from './translate.js';
beforeEach(() => {
  vi.stubGlobal('document', new Window().document);
});
afterEach(() => {
  useTranslation(undefined);
  vi.unstubAllGlobals();
});
describe('只读记录表', () => {
  const records = { a: { entity: 'Asset' as const, fields: { name: '工作站', status: null, purchasePrice: 120 } } };
  const cells = () => [...readOnlyRecords(records).querySelectorAll('td')].map(cell => cell.textContent);

  it('翻译实体、字段名与空值标记，用户录入的数据原样显示', () => {
    useTranslation(key => `<${key.replace('collaboration.', '')}>`);
    expect(cells()).toEqual(['<资产>', '工作站', '<名称>：工作站；<状态>：<空>；<购入价>：120']);
  });

  it('没有翻译函数时直接显示中文原文', () => {
    expect(cells()).toEqual(['资产', '工作站', '名称：工作站；状态：空；购入价：120']);
  });
});

describe('同步按钮与过期的待上传提交', () => {
  function editor(expired: boolean) {
    const sync = vi.fn(async () => undefined);
    const controller = {
      draft: {
        context: { userId: 'u1', teamId: 'team', appId: 'assets', taskId: 'task' },
        name: 'Task',
        base: null,
        remoteHead: null,
        localHead: 'c1',
        records: {},
        committed: {},
        revision: 1,
        queue: [{ operationId: 'op', expectedHead: null, commits: [], createdAt: 0 }],
        locked: false,
        verifiedAt: 1
      },
      snapshot: null,
      syncing: false,
      online: true,
      uploadExpired: () => expired,
      sync
    } as unknown as CollaborationController;
    const perform: Perform = async work => {
      await work();
    };
    const buttons = (root: Element, name: string) =>
      [...root.querySelectorAll('button')].filter(node => node.textContent === name);
    return { view: () => new TaskEditor(controller, perform, () => undefined).view(), sync, buttons };
  }
  it('队首上传已超过回执保留期时提供「确认同步过期提交」，点击按用户确认同步', async () => {
    const { view, sync, buttons } = editor(true);
    const [confirm] = buttons(view(), '确认同步过期提交');
    expect(confirm).toBeDefined();
    confirm.click();
    await vi.waitFor(() => expect(sync).toHaveBeenCalledWith(false, true));
  });
  it('没有过期的待上传提交时不显示确认按钮', () => {
    const { view, buttons } = editor(false);
    expect(buttons(view(), '确认同步过期提交')).toHaveLength(0);
    expect(buttons(view(), '同步')).toHaveLength(1);
  });
});
