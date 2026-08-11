import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OpfsService } from '../services/opfs.service';
import { OPFSFileEntry } from '../utils/opfs-utils';
import { OpfsFileGridComponent } from './opfs-file-grid.component';

describe('OpfsFileGridComponent', () => {
  const entry: OPFSFileEntry = {
    name: 'photo.png',
    kind: 'file',
    handle: {} as FileSystemFileHandle,
    path: '/photo.png'
  };
  const previewFile = vi.fn();

  beforeEach(async () => {
    vi.useFakeTimers();
    previewFile.mockReset();
    await TestBed.configureTestingModule({
      imports: [OpfsFileGridComponent],
      providers: [{ provide: OpfsService, useValue: { previewFile } }]
    }).compileComponents();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('销毁时应该取消待执行的缩略图加载', async () => {
    const fixture = TestBed.createComponent(OpfsFileGridComponent);
    fixture.componentRef.setInput('entries', [entry]);
    fixture.componentRef.setInput('currentPath', '/');
    fixture.detectChanges();

    fixture.destroy();
    await vi.runAllTimersAsync();

    expect(previewFile).not.toHaveBeenCalled();
  });

  it('释放旧 URL 后应该立即清空模板可见状态', () => {
    const fixture = TestBed.createComponent(OpfsFileGridComponent);
    fixture.componentRef.setInput('entries', [entry]);
    fixture.componentRef.setInput('currentPath', '/');
    fixture.detectChanges();
    fixture.componentInstance.thumbnailUrls.set(new Map([[entry.path, 'blob:old']]));
    previewFile.mockReturnValue(new Promise(() => undefined));
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

    void fixture.componentInstance.loadThumbnails();

    expect(fixture.componentInstance.thumbnailUrls().size).toBe(0);
    fixture.destroy();
  });

  it('销毁后不应该发布异步生成的缩略图 URL', async () => {
    let resolvePreview!: (value: { data: Blob }) => void;
    previewFile.mockReturnValue(new Promise(resolve => (resolvePreview = resolve)));
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:new');
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const fixture = TestBed.createComponent(OpfsFileGridComponent);
    fixture.componentRef.setInput('entries', [entry]);
    fixture.componentRef.setInput('currentPath', '/');
    fixture.detectChanges();

    const loading = fixture.componentInstance.loadThumbnails();
    fixture.destroy();
    resolvePreview({ data: new Blob(['image']) });
    await loading;

    expect(fixture.componentInstance.thumbnailUrls().size).toBe(0);
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:new');
  });
});
