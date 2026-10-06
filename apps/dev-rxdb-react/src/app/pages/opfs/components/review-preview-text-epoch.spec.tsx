import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OPFSFileEntry } from '../utils/opfs-utils';
import { OpfsFilePreview } from './OpfsFilePreview';

afterEach(() => {
  cleanup();
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
  const onClose = vi.fn();
  const result = render(<OpfsFilePreview entry={A} previewFile={previewFile} onClose={onClose} />);
  try {
    await act(async () => {
      await started.promise;
    });
    if (!overlap)
      await act(async () => {
        text.resolve('old-A');
        await text.promise;
      });
    await act(async () => {
      result.rerender(<OpfsFilePreview entry={B} previewFile={previewFile} onClose={onClose} />);
    });
    await waitFor(() => expect(result.container.querySelector('pre')?.textContent).toBe('new-B'));
    await act(async () => {
      text.resolve('old-A');
      await text.promise;
    });
    console.info(
      'REVIEW_PREVIEW',
      JSON.stringify({
        framework: 'react',
        overlap,
        title: result.container.querySelector('h3')?.textContent,
        text: result.container.querySelector('pre')?.textContent
      })
    );
    expect(result.container.querySelector('pre')?.textContent).toBe('new-B');
  } finally {
    text.resolve('old-A');
    result.unmount();
  }
};

describe('预览竞态联审对照：React 在每个异步段后检查 active', () => {
  it('A 的文本读取迟到时保留 B', () => probe(true));
  it('先结束 A 再切换时也保留 B', () => probe(false));
});
