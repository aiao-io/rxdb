import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BOM_WORKSPACE_CONFIG } from './config';
import { BomDemoService } from './app/bom-demo.service';
import { TransferPage } from './transfer-page';
const pending = { name: 'Windrose 已确认装配', datasetId: 'windrose', rootItemNo: '1300001', revisionNo: 'W1', orgId: 'org-windrose', records: [{ kind: 'item', itemNo: '1300001' }], identities: [] };
const setup = async (incoming = false) => {
  const service = { databaseName: signal('new-bom'), previousDatabase: signal('old-bom'), connected: signal(true),
    backup: vi.fn().mockResolvedValue({ blob: new Blob(['archive']), sha256: 'digest', bytes: 7 }),
    restoreBackup: vi.fn().mockResolvedValue('new-restored'), rollbackDatabase: vi.fn().mockResolvedValue(undefined),
    importBom: vi.fn().mockResolvedValue({ committed: true, diagnostics: [] }) };
  const config = { readPending: vi.fn().mockResolvedValue(incoming ? pending : undefined), completePending: vi.fn().mockResolvedValue(undefined) };
  TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: BomDemoService, useValue: service }, { provide: BOM_WORKSPACE_CONFIG, useValue: config }] });
  const fixture = TestBed.createComponent(TransferPage); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
  return { fixture, page: fixture.componentInstance, service, config };
};
afterEach(() => { TestBed.resetTestingModule(); vi.restoreAllMocks(); });
describe('备份迁移页面', () => {
  it('完整显示待接收草稿，确认才写入并保留来源对应关系', async () => {
    const { page, service, fixture, config } = await setup(true);
    expect(fixture.nativeElement.textContent).toContain('1300001'); expect(service.importBom).not.toHaveBeenCalled();
    await page.importDraft(); expect(service.importBom).toHaveBeenCalledWith(pending.records);
    expect(config.completePending).toHaveBeenCalledWith(pending); expect(page.pending()).toBeUndefined();
    expect(page.message()).toContain('已写入领域草稿');
  });
  it('领域拒绝保留输入并显示逐条诊断', async () => {
    const { page, service, config } = await setup(true);
    service.importBom.mockResolvedValueOnce({ committed: false, diagnostics: [{ message: '发生项数量不合法' }] });
    await page.importDraft(); expect(page.error()).toBe('发生项数量不合法'); expect(page.pending()).toEqual(pending);
    expect(config.completePending).not.toHaveBeenCalled();
  });
  it('文件选择可取消，过大归档拒绝，正常文件允许恢复', async () => {
    const { page, service } = await setup();
    const file = new File(['archive'], 'old.rxdb-backup');
    page.file({ target: { files: [], value: 'x' } } as unknown as Event); expect(page.incoming()).toBeNull();
    page.file({ target: { files: [{ size: 501 * 1024 * 1024 }], value: '' } } as unknown as Event); expect(page.error()).toContain('500 MiB');
    page.file({ target: { files: [file], value: '' } } as unknown as Event); await page.restore();
    expect(service.restoreBackup).toHaveBeenCalledWith(file); expect(page.message()).toContain('原库保留'); expect(page.incoming()).toBeNull();
  });
  it('坏归档显示错误并保留文件，可重试', async () => {
    const { page, service } = await setup(); const file = new File(['bad'], 'bad.rxdb-backup');
    page.incoming.set(file); service.restoreBackup.mockRejectedValueOnce(new Error('校验和错误'));
    await page.restore(); expect(page.error()).toBe('校验和错误'); expect(page.incoming()).toBe(file); expect(page.busy()).toBe(false);
  });
  it('导出真实归档并显示校验和，随后可以回退', async () => {
    const { page, service } = await setup();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:archive');
    await page.backup(); expect(click).toHaveBeenCalledOnce(); expect(page.message()).toContain('digest');
    await page.rollback(); expect(service.rollbackDatabase).toHaveBeenCalledOnce(); expect(page.message()).toContain('已回退');
  });
  it('忙碌时不执行第二笔操作，没有文件或草稿不调用领域写入', async () => {
    const { page, service } = await setup(); page.busy.set(true); await page.rollback();
    expect(service.rollbackDatabase).not.toHaveBeenCalled(); await page.restore(); await page.importDraft();
    expect(service.restoreBackup).not.toHaveBeenCalled(); expect(service.importBom).not.toHaveBeenCalled();
  });
  it('待接收数据读取失败可见', async () => {
    const { page, config } = await setup(); config.readPending.mockRejectedValueOnce(new Error('本机存储不可读'));
    await page.ngOnInit(); expect(page.error()).toBe('本机存储不可读');
  });
});
