import { RxDB } from '@aiao/rxdb';
import { StorageFileMeta } from '@aiao/rxdb-plugin-storage';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StorageBrowserItem } from '../utils/storage-utils';
import { StorageFileGridComponent } from './storage-file-grid.component';

describe('StorageFileGridComponent', () => {
  const entry: StorageBrowserItem = {
    name: 'photo.png',
    kind: 'file',
    path: '/photo.png',
    meta: { id: 'photo' } as unknown as StorageFileMeta
  };
  const createObjectUrl = vi.fn();
  const revokeObjectUrl = vi.fn();

  beforeEach(async () => {
    vi.useFakeTimers();
    createObjectUrl.mockReset();
    revokeObjectUrl.mockReset();
    await TestBed.configureTestingModule({
      imports: [StorageFileGridComponent],
      providers: [{ provide: RxDB, useValue: { storage: { createObjectUrl, revokeObjectUrl } } }]
    }).compileComponents();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  it('销毁时应该取消待执行的缩略图加载', async () => {
    const fixture = TestBed.createComponent(StorageFileGridComponent);
    fixture.componentRef.setInput('entries', [entry]);
    fixture.componentRef.setInput('currentPath', '/');
    fixture.detectChanges();

    fixture.destroy();
    await vi.runAllTimersAsync();

    expect(createObjectUrl).not.toHaveBeenCalled();
  });

  it('销毁后不应该发布异步生成的缩略图 URL', async () => {
    let resolveUrl!: (value: string) => void;
    createObjectUrl.mockReturnValue(new Promise(resolve => (resolveUrl = resolve)));
    const fixture = TestBed.createComponent(StorageFileGridComponent);
    fixture.componentRef.setInput('entries', [entry]);
    fixture.componentRef.setInput('currentPath', '/');
    fixture.detectChanges();

    const loading = fixture.componentInstance.loadThumbnails();
    fixture.destroy();
    resolveUrl('blob:new');
    await loading;

    expect(fixture.componentInstance.thumbnailUrls().size).toBe(0);
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:new');
  });
});
