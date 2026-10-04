import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpfsService } from '../services/opfs.service';
import type { OPFSFileEntry } from '../utils/opfs-utils';
import { OpfsFilePreviewComponent } from './opfs-file-preview.component';

afterEach(() => {
  TestBed.resetTestingModule();
  vi.restoreAllMocks();
});

const entry = (name: string): OPFSFileEntry => ({
  name,
  path: `/${name}`,
  kind: 'file',
  handle: {} as FileSystemFileHandle
});
const A = entry('a.txt');
const B = entry('b.txt');
const nextTurn = () => new Promise<void>(resolve => setTimeout(resolve, 0));

const probe = async (overlap: boolean) => {
  const text = Promise.withResolvers<string>();
  const started = Promise.withResolvers<void>();
  const blob = new Blob(['old-A']);
  vi.spyOn(blob, 'text').mockImplementation(() => {
    started.resolve();
    return text.promise;
  });
  const previewFile = vi.fn(async (file: OPFSFileEntry) => ({
    data: file.path === A.path ? blob : 'new-B',
    type: 'text/plain'
  }));
  await TestBed.configureTestingModule({
    imports: [OpfsFilePreviewComponent],
    providers: [{ provide: OpfsService, useValue: { previewFile } }]
  }).compileComponents();
  const fixture = TestBed.createComponent(OpfsFilePreviewComponent);
  try {
    fixture.componentRef.setInput('entry', A);
    fixture.detectChanges();
    await started.promise;
    if (!overlap) {
      text.resolve('old-A');
      await nextTurn();
    }
    fixture.componentRef.setInput('entry', B);
    fixture.detectChanges();
    await nextTurn();
    fixture.detectChanges();
    expect(fixture.componentInstance.textContent()).toBe('new-B');
    text.resolve('old-A');
    await nextTurn();
    fixture.detectChanges();
    console.info(
      'REVIEW_PREVIEW',
      JSON.stringify({
        framework: 'angular',
        overlap,
        title: fixture.componentInstance.entry()?.name,
        text: fixture.componentInstance.textContent()
      })
    );
    expect(fixture.componentInstance.textContent()).toBe('new-B');
  } finally {
    text.resolve('old-A');
    await nextTurn();
    fixture.destroy();
  }
};

describe('评审复验：previewFile 之后的 Blob.text 仍须属于当前文件', () => {
  it('A 的文本读取迟到时不能覆盖已经完成的 B', () => probe(true));
  it('对照：先结束 A 的文本读取再切换 B，显示 B', () => probe(false));
});
