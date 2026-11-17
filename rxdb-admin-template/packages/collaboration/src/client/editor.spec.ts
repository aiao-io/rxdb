import { Window } from 'happy-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Records, SchemaManifest } from '../model.js';
import { planningSchema } from '../planning.testing.js';
import { assetLabels, assetSchema } from '../schema.testing.js';
import type { CollaborationController } from './controller.js';
import { readOnlyRecords, TaskEditor } from './editor.js';
import type { Perform } from './elements.js';
import { useLabels } from './labels.js';
import { useTranslation } from './translate.js';
beforeEach(() => {
  vi.stubGlobal('document', new Window().document);
  useLabels(assetLabels);
});
afterEach(() => {
  useTranslation(undefined);
  useLabels(undefined);
  vi.unstubAllGlobals();
});
describe('只读记录表', () => {
  const records = { a: { entity: 'Asset' as const, fields: { name: '工作站', status: null, purchasePrice: 120 } } };
  const cells = () => [...readOnlyRecords(records, assetSchema).querySelectorAll('td')].map(cell => cell.textContent);

  it('翻译实体、字段名与空值标记，用户录入的数据原样显示', () => {
    useTranslation(key => `<${key.replace('collaboration.', '')}>`);
    expect(cells()).toEqual(['<资产>', '工作站', '<名称>：工作站；<状态>：<空>；<购入价>：120']);
  });

  it('没有翻译函数时直接显示中文原文', () => {
    expect(cells()).toEqual(['资产', '工作站', '名称：工作站；状态：空；购入价：120']);
  });
});

/** 只给编辑器用到的控制器部分：草稿（含数据模式清单）、同步与在线状态。 */
function draftController(schema: SchemaManifest, records: Records, overrides: Record<string, unknown> = {}) {
  return {
    draft: {
      context: { userId: 'u1', teamId: 'team', appId: 'app', taskId: 'task' },
      schema,
      name: 'Task',
      base: null,
      remoteHead: null,
      localHead: null,
      records,
      committed: records,
      revision: 1,
      queue: [],
      locked: false,
      verifiedAt: 1
    },
    snapshot: null,
    syncing: false,
    online: true,
    uploadExpired: () => false,
    ...overrides
  } as unknown as CollaborationController;
}
const perform: Perform = async work => {
  await work();
};

describe('编辑器按数据模式清单渲染', () => {
  it('非资产的清单：每个实体一个分区，列来自清单的记录字段，关联字段是指向目标实体记录的下拉框', () => {
    useLabels(undefined);
    const records: Records = {
      p1: { entity: 'Project', fields: { title: 'Alpha' } },
      m1: { entity: 'Milestone', fields: { name: 'Kickoff', dueOn: '2026-01-01', projectId: 'p1' } }
    };
    const view = new TaskEditor(draftController(planningSchema, records), perform, () => undefined).view();
    expect([...view.querySelectorAll('section section h2')].map(node => node.textContent)).toEqual([
      'Project',
      'Milestone',
      'Tag'
    ]);
    const headers = [...view.querySelectorAll('section section')].map(section =>
      [...section.querySelectorAll('th')].map(node => node.textContent)
    );
    expect(headers[1]).toEqual(['里程碑名', '权重', '截止日', '已完成', '所属项目', '标签', '操作']);
    const project = view.querySelector<HTMLSelectElement>('select[aria-label="所属项目"]')!;
    expect([...project.options].map(option => [option.value, option.textContent])).toEqual([
      ['', '请选择'],
      ['p1', 'Alpha']
    ]);
    expect(project.value).toBe('p1');
    expect(view.querySelector<HTMLInputElement>('input[aria-label="权重"]')!.type).toBe('number');
    expect(view.querySelector<HTMLInputElement>('input[aria-label="截止日"]')!.type).toBe('date');
  });
  it('资产清单：宿主应用的标签覆盖实体名与个别字段，其余字段取清单里声明的显示名', () => {
    const view = new TaskEditor(draftController(assetSchema, {}), perform, () => undefined).view();
    expect([...view.querySelectorAll('section section h2')].map(node => node.textContent)).toEqual([
      '分类',
      '资产',
      '维护记录'
    ]);
    expect([...view.querySelectorAll('button')].map(node => node.textContent)).toContain('新增维护记录');
    const columns = [...view.querySelectorAll('th')].map(node => node.textContent);
    expect(columns).toEqual([
      ...['名称', '说明', '操作'],
      ...['名称', '状态', '购入价', '购入日期', '分类', '操作'],
      ...['事项', '费用', '日期', '所属资产', '操作']
    ]);
  });
});

describe('同步按钮与过期的待上传提交', () => {
  function editor(expired: boolean) {
    const sync = vi.fn(async () => undefined);
    const controller = {
      draft: {
        context: { userId: 'u1', teamId: 'team', appId: 'assets', taskId: 'task' },
        schema: assetSchema,
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
