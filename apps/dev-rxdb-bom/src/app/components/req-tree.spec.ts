import type { ExplosionResult, RequirementLine } from '@aiao/rxdb-plugin-bom';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { ReqTree } from './req-tree';

describe('展开结构的产出分类', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('联产品、副产品和废料分别标识，保留原始数量属性', async () => {
    const result: ExplosionResult = {
      manifest: {
        context: { bomType: 'ebom', orgId: 'org-x', asOfDate: new Date('2026-09-22') },
        parentItemId: 'root',
        parentRevisionId: 'root-a',
        headerIds: [],
        occurrenceIds: [],
        conversions: [],
        formulaGrammarVersion: 'fixture',
        algorithmVersion: 'fixture',
        unresolved: []
      },
      outputs: [
        { path: ['joint'], itemId: 'joint', direction: 'produce', qty: '2', uom: 'kg' },
        { path: ['by-product'], itemId: 'by-product', direction: 'by_product', qty: '3', uom: 'kg' },
        { path: ['scrap'], itemId: 'scrap', direction: 'scrap_out', qty: '4', uom: 'kg' }
      ],
      requirementLines: [],
      penetrations: [],
      unresolved: [],
      truncated: null
    };
    const fixture = TestBed.createComponent(ReqTree);
    fixture.componentRef.setInput('result', result);
    fixture.componentRef.setInput('itemNos', new Map([['joint', 'PCBA']]));
    fixture.componentRef.setInput('designators', new Map<string, string[]>());
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelector('[data-direction=produce]')?.textContent).toContain('联产品');
    expect(root.querySelector('[data-direction=produce]')?.textContent).toContain('控制板（PCBA）');
    expect(root.querySelector('[data-direction=produce]')?.getAttribute('data-output')).toBe('PCBA');
    expect(root.querySelector('[data-direction=by_product]')?.textContent).toContain('副产品');
    expect(root.querySelector('[data-direction=scrap_out]')?.textContent).toContain('废料');
    expect(root.querySelector('[data-direction=produce] [data-qty]')?.getAttribute('data-qty')).toBe('2');
  });
});

const line = (itemId: string, path: string[]): RequirementLine => ({
  path,
  itemId,
  revisionId: `${itemId}-a`,
  qty: '2',
  uom: 'pcs',
  steps: {
    planned: { value: '1', uom: 'pcs' },
    assemblyScrapped: { value: '1', uom: 'pcs' },
    gross: { value: '2', uom: 'pcs' },
    componentScrapped: { value: '2', uom: 'pcs' },
    operationScrapped: null,
    converted: { value: '2', uom: 'pcs' },
    phantom: { value: false, source: 'revision', revisionId: `${itemId}-a` }
  }
});

const treeResult = (lines: RequirementLine[]): ExplosionResult => ({
  manifest: {
    context: { bomType: 'ebom', orgId: 'org-x', asOfDate: new Date('2026-09-22') },
    parentItemId: 'root',
    parentRevisionId: 'root-a',
    headerIds: [],
    occurrenceIds: [],
    conversions: [],
    formulaGrammarVersion: 'fixture',
    algorithmVersion: 'fixture',
    unresolved: []
  },
  requirementLines: lines,
  outputs: [],
  penetrations: [],
  unresolved: [],
  truncated: null
});

const mountTree = async (result: ExplosionResult) => {
  const fixture = TestBed.createComponent(ReqTree);
  fixture.componentRef.setInput('result', result);
  fixture.componentRef.setInput(
    'itemNos',
    new Map([
      ['root', 'SC-100'],
      ['board', 'PCBA'],
      ['wire', 'WH-01'],
      ['screw', 'M3']
    ])
  );
  fixture.componentRef.setInput('designators', new Map<string, string[]>());
  await fixture.whenStable();
  return fixture;
};

describe('需求树的层级、焦点与裁决', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('默认只展示受控层级，展开和收起保留独立发生项路径', async () => {
    const fixture = await mountTree(
      treeResult([line('board', ['board']), line('wire', ['board', 'wire']), line('screw', ['board', 'wire', 'screw'])])
    );
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[role=treeitem][aria-level="1"]')?.textContent).toContain('SC-100');
    expect(root.querySelectorAll('[data-item=M3]')).toHaveLength(0);
    const wire = root.querySelector('[data-item=WH-01]') as HTMLElement;
    wire.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await fixture.whenStable();
    expect(root.querySelectorAll('[data-item=M3]')).toHaveLength(1);
    (root.querySelector('[data-item=WH-01]') as HTMLElement).dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })
    );
    await fixture.whenStable();
    expect(root.querySelectorAll('[data-item=M3]')).toHaveLength(0);
  });

  it('树只有一个Tab停靠点，方向键移动焦点，Enter选中当前需求行', async () => {
    const demand = line('board', ['board']);
    const fixture = await mountTree(treeResult([demand]));
    const selected: RequirementLine[] = [];
    fixture.componentInstance.rowSelect.subscribe(value => selected.push(value));
    const root = fixture.nativeElement as HTMLElement;
    const first = root.querySelector('[role=treeitem][tabindex="0"]') as HTMLElement;
    expect(root.querySelectorAll('[role=treeitem][tabindex="0"]')).toHaveLength(1);
    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    await fixture.whenStable();
    const current = root.querySelector('[role=treeitem][tabindex="0"]') as HTMLElement;
    expect(current.getAttribute('data-item')).toBe('PCBA');
    current.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(selected).toEqual([demand]);
  });

  it('所选路径面包屑包含虚拟件，展示穿透来源和下层计划量', async () => {
    const demand = line('screw', ['wire', 'screw']);
    const result = treeResult([demand]);
    result.penetrations = [
      {
        path: ['wire'],
        occurrenceId: 'wire',
        childItemId: 'wire',
        revisionId: 'wire-a',
        source: 'override',
        converted: { value: '3', uom: 'pcs' },
        childPlanned: { value: '3', uom: 'set' }
      }
    ];
    const fixture = await mountTree(result);
    fixture.componentRef.setInput('selected', demand);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[aria-label="所选发生项路径"]')?.textContent).toMatch(/SC-100.*WH-01.*M3/s);
    expect(root.querySelector('[data-kind=phantom]')?.textContent).toMatch(/虚拟件穿透.*3.*set/s);
    expect(root.querySelector('[data-kind=phantom]')?.textContent).toContain('发生项设置');
  });

  it('宽树限制首批DOM并提供继续显示，避免一万条行全部挂载', async () => {
    const fixture = await mountTree(
      treeResult(Array.from({ length: 1000 }, (_, index) => line('screw', [`screw-${index}`])))
    );
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelectorAll('[role=treeitem]').length).toBeLessThanOrEqual(151);
    const more = [...root.querySelectorAll('button')].find(button => button.textContent?.includes('继续显示'));
    expect(more).toBeDefined();
    more?.click();
    await fixture.whenStable();
    expect(root.querySelectorAll('[role=treeitem]').length).toBeGreaterThan(151);
    expect(root.querySelectorAll('[role=treeitem][tabindex="0"]')).toHaveLength(1);
  });

  it('未裁决备选与替代成员发出选择请求，序列号仅请求补充条件', async () => {
    const result = treeResult([]);
    result.manifest.unresolved = [
      { parentItemId: 'root', parentRevisionId: 'root-a', candidates: [{ headerId: 'h2', alternativeNo: 2 }] },
      {
        parentItemId: 'root',
        parentRevisionId: 'root-a',
        reason: 'unit',
        lineId: 'line-unit',
        candidates: [{ headerId: 'h1', alternativeNo: 1, childItemId: 'board', unitFrom: 100, unitTo: 200 }]
      }
    ];
    result.unresolved = [
      {
        groupId: 'battery-group',
        groupCode: 'BATTERY',
        candidates: [{ itemId: 'board', role: 'substitute', occurrenceId: 'choice-board' }]
      }
    ];
    const fixture = await mountTree(result);
    const emitted: unknown[] = [];
    fixture.componentInstance.conditionRequest.subscribe(value => emitted.push(value));
    const root = fixture.nativeElement as HTMLElement;
    const buttons = [...root.querySelectorAll('button')];
    buttons.find(button => button.textContent?.includes('采用备选 2'))?.click();
    buttons.find(button => button.textContent?.includes('填写序列号'))?.click();
    buttons.find(button => button.textContent?.includes('选择控制板'))?.click();
    expect(emitted).toEqual([
      { kind: 'alternative', alternativeNo: 2 },
      { kind: 'unit', lineId: 'line-unit' },
      { kind: 'substitute', groupId: 'battery-group', groupCode: 'BATTERY', memberKey: 'board' }
    ]);
  });

  it('同名替代组分别显示并按组 ID 发出选择请求', async () => {
    const result = treeResult([]);
    result.unresolved = ['group-a', 'group-b'].map((groupId, index) => ({
      groupId,
      groupCode: 'G1',
      candidates: [{ itemId: 'board', role: 'primary', occurrenceId: `candidate-${index}` }]
    }));
    const fixture = await mountTree(result);
    const emitted: unknown[] = [];
    fixture.componentInstance.conditionRequest.subscribe(value => emitted.push(value));
    const root = fixture.nativeElement as HTMLElement;
    const choices = [...root.querySelectorAll('button')].filter(button => button.textContent?.includes('选择控制板'));
    expect(choices).toHaveLength(2);
    choices.forEach(button => button.click());
    expect(emitted).toEqual(
      ['group-a', 'group-b'].map(groupId => ({
        kind: 'substitute',
        groupId,
        groupCode: 'G1',
        memberKey: 'board'
      }))
    );
  });

  it.each([1000, 10000])('定位%s条路径的末项仍保持有界DOM和唯一键盘入口', async count => {
    const lines = Array.from({ length: count }, (_, index) => line('screw', [`screw-${index}`]));
    const fixture = await mountTree(treeResult(lines));
    fixture.componentRef.setInput('selected', lines[count - 1]);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelector('[role=treeitem][aria-selected="true"]')?.getAttribute('data-node-key')).toBe(
      JSON.stringify([`screw-${count - 1}`])
    );
    expect(root.querySelectorAll('[role=treeitem]').length).toBeLessThanOrEqual(151);
    expect(root.querySelectorAll('[role=treeitem][tabindex="0"]')).toHaveLength(1);
  });

  it('50层末端可定位，祖先保持可见且缩进宽度有界', async () => {
    const path = Array.from({ length: 50 }, (_, index) => `occurrence-${index}`);
    const lines = path.map((_, index) => line(`part-${index}`, path.slice(0, index + 1)));
    const fixture = await mountTree(treeResult(lines));
    fixture.componentRef.setInput('selected', lines[49]);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const selected = root.querySelector<HTMLElement>('[role=treeitem][aria-selected="true"]');

    expect(selected?.getAttribute('data-node-key')).toBe(JSON.stringify(path));
    expect(selected?.getAttribute('aria-level')).toBe('51');
    expect(root.querySelectorAll('[role=treeitem]')).toHaveLength(51);
    expect(root.querySelectorAll('[role=treeitem][tabindex="0"]')).toHaveLength(1);
    expect(Number.parseFloat(selected!.style.paddingInlineStart)).toBeLessThanOrEqual(88);
    expect(Number.parseFloat(selected!.style.paddingInlineStart)).toBeGreaterThan(0);
    expect(selected?.textContent).toContain('第 50 层');
  });
});
