import type { ExplosionManifest, ImportDiagnostic } from '@aiao/rxdb-plugin-bom';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BomDemoService } from '../bom-demo.service';
import { IntegrationPanel } from './integration-panel';

const draft = {
  headerId: 'import-h1',
  itemNo: 'IMPORTED',
  revisionNo: 'A',
  bomType: 'ebom',
  orgId: 'org-x',
  lineCount: 3
};

const mount = async () => {
  const service = {
    ready: signal(true),
    resetting: signal(false),
    dataEpoch: signal(0),
    dataRevision: signal(0),
    importedDrafts: signal([draft]),
    refreshImportedDrafts: vi.fn().mockResolvedValue(undefined),
    importBom: vi
      .fn<() => Promise<{ committed: boolean; diagnostics: ImportDiagnostic[]; headerIds: string[] }>>()
      .mockResolvedValue({ committed: false, diagnostics: [], headerIds: [] }),
    publishImported: vi.fn().mockResolvedValue(undefined),
    exportBom: vi.fn().mockResolvedValue('{}')
  };
  TestBed.configureTestingModule({ providers: [{ provide: BomDemoService, useValue: service }] });
  const fixture = TestBed.createComponent(IntegrationPanel);
  fixture.componentRef.setInput('asOfDate', '2026-10-17');
  fixture.componentRef.setInput('rootKey', 'SC-100');
  fixture.componentRef.setInput('plannedQty', '1');
  await fixture.whenStable();
  return { fixture, panel: fixture.componentInstance, service, host: fixture.nativeElement as HTMLElement };
};

describe('结构文件的草稿恢复与错误定位', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('重新打开面板可以核对并发布数据库中已保存的草稿', async () => {
    const { panel, host, service } = await mount();

    expect(service.refreshImportedDrafts).toHaveBeenCalledOnce();
    expect(host.textContent).toContain('IMPORTED');
    expect(host.textContent).toContain('org-x');
    expect(host.textContent).toContain('3');
    expect(panel.headerIds()).toEqual([]);
    host.querySelector<HTMLInputElement>('[data-testid=import-draft-select]')?.click();
    panel.publishDate.set('2099-01-01');
    await panel.publish();

    expect(service.publishImported).toHaveBeenCalledExactlyOnceWith(['import-h1'], '2099-01-01');
  });

  it('校验失败保留结构化诊断，不丢失实体类型和自然键', async () => {
    const { panel, fixture, service, host } = await mount();
    const diagnostic: ImportDiagnostic = {
      kind: 'occurrence',
      naturalKey: '["occurrence","PART-A","A",10]',
      message: 'source_ref=文件行8：数量不合法'
    };
    service.importBom.mockResolvedValue({ committed: false, diagnostics: [diagnostic], headerIds: [] });
    panel.file.set(new File(['{}'], 'invalid.json', { type: 'application/json' }));

    await panel.importDraft();
    await fixture.whenStable();

    expect(panel.diagnostics()).toEqual([diagnostic]);
    expect(host.querySelector('[data-testid=import-diagnostics]')?.textContent).toContain(diagnostic.naturalKey);
    expect(host.querySelector('[data-testid=import-diagnostics]')?.textContent).toContain('发生项');
    expect(service.publishImported).not.toHaveBeenCalled();
  });

  it('发布日期只承诺新修订，不误报已有修订与发生项都从该日生效', async () => {
    const { panel, host, fixture } = await mount();
    expect(host.textContent).toContain('新修订生效日期');
    expect(host.textContent).toContain('已有发布修订和发生项保留原日期');
    host.querySelector<HTMLInputElement>('[data-testid=import-draft-select]')?.click();
    panel.publishDate.set('2099-01-01');
    await panel.publish();
    await fixture.whenStable();

    expect(panel.status()).toContain('发布成功');
    expect(panel.status()).not.toContain('从 2099-01-01 起');
    expect(panel.status()).toContain('原生效日期');
  });

  it('发布失败保留可重试草稿，切换文件不隐藏已经保存的草稿', async () => {
    const { panel, service, fixture, host } = await mount();
    host.querySelector<HTMLInputElement>('[data-testid=import-draft-select]')?.click();
    service.publishImported.mockRejectedValue(new Error('第二份结构发布失败'));
    await panel.publish();
    const chooser = document.createElement('input');
    chooser.type = 'file';
    panel.chooseFile({ target: chooser } as unknown as Event);
    await fixture.whenStable();

    expect(panel.headerIds()).toEqual(['import-h1']);
    expect(host.textContent).toContain('IMPORTED');
    expect(service.importedDrafts()).toEqual([draft]);
  });

  it('重置开始后迟到的导入响应不能复活旧库的草稿和成功提示', async () => {
    const { panel, service, fixture } = await mount();
    let finish: ((result: { committed: boolean; diagnostics: []; headerIds: string[] }) => void) | undefined;
    service.importBom.mockImplementation(
      () =>
        new Promise(resolve => {
          finish = resolve;
        })
    );
    panel.file.set(new File(['{}'], 'valid.json', { type: 'application/json' }));
    const pending = panel.importDraft();
    await Promise.resolve();
    service.dataEpoch.update(value => value + 1);
    service.resetting.set(true);
    service.ready.set(false);
    service.importedDrafts.set([]);
    await fixture.whenStable();
    finish?.({ committed: true, diagnostics: [], headerIds: ['old-header'] });
    await pending;
    await fixture.whenStable();

    expect(panel.headerIds()).toEqual([]);
    expect(panel.status()).not.toContain('成功');
  });

  it('读取文件期间完成重置后，不把旧文件写入新一代数据库', async () => {
    const { panel, service, fixture } = await mount();
    let finishRead: ((text: string) => void) | undefined;
    const file = new File(['{}'], 'slow.json', { type: 'application/json' });
    vi.spyOn(file, 'text').mockImplementation(
      () =>
        new Promise(resolve => {
          finishRead = resolve;
        })
    );
    panel.file.set(file);
    const pending = panel.importDraft();
    service.dataEpoch.update(value => value + 1);
    service.resetting.set(true);
    service.ready.set(false);
    service.importedDrafts.set([]);
    await fixture.whenStable();
    service.resetting.set(false);
    service.ready.set(true);
    await fixture.whenStable();

    finishRead?.('{}');
    await pending;

    expect(service.importBom).not.toHaveBeenCalled();
    expect(panel.headerIds()).toEqual([]);
    expect(panel.busy()).toBe(false);
  });

  it('重新查询的导出结构与已确认清单不同则阻止下载并要求重新展开', async () => {
    const { panel, service, fixture } = await mount();
    const manifest: ExplosionManifest = {
      context: { bomType: 'ebom', orgId: 'org-x', asOfDate: new Date('2026-10-17') },
      parentItemId: 'root',
      parentRevisionId: 'revision-a',
      headerIds: ['h1'],
      occurrenceIds: ['o1'],
      conversions: [],
      formulaGrammarVersion: '1',
      algorithmVersion: '1',
      unresolved: []
    };
    fixture.componentRef.setInput('expanded', true);
    fixture.componentRef.setInput('expectedManifest', manifest);
    service.exportBom.mockResolvedValue(JSON.stringify({ manifest: { ...manifest, occurrenceIds: ['o2'] } }));
    const create = vi.spyOn(URL, 'createObjectURL');

    await panel.download();

    expect(create).not.toHaveBeenCalled();
    expect(panel.exportFailed()).toBe(true);
    expect(panel.exportStatus()).toContain('重新展开');
  });
});
