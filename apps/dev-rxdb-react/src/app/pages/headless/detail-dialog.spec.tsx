import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ArticleRecord, DetailSaveResult } from './article-model';
import { DetailDialog } from './detail-dialog';

/**
 * @fileoverview 详情弹窗的保存会话：只有仍挂着、没被取消的弹窗才能以 saved 关闭。
 * 页面的弹窗控制器长期存在，旧弹窗迟到的保存结果若照样回调 onClose，会关掉随后打开的新弹窗；
 * Angular 的 output 与 Vue 的 emit 在组件销毁后本就不再派发，React 的回调要自己守。
 */

vi.mock('@aiao/rxdb-react', () => ({ useRxDB: () => ({ entityManager: { instantiate: () => ({}) } }) }));

const record = {
  id: 'article-1',
  title: 'alpha',
  body: 'body',
  category: 'tech',
  tags: [],
  authorId: 'author-1',
  viewCount: 1,
  createdAt: new Date('2026-11-09T00:00:00Z'),
  updatedAt: new Date('2026-11-09T00:00:00Z'),
  createdBy: null,
  updatedBy: null
} as unknown as ArticleRecord;

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>(settle => (resolve = settle));
  return { promise, resolve };
}

async function startSaving(onClose: (result: string) => void) {
  const pending = deferred();
  const onSave = vi.fn<(result: DetailSaveResult) => Promise<void>>(() => pending.promise);
  const view = render(<DetailDialog data={{ mode: 'edit', record }} onSave={onSave} onClose={onClose} />);
  const form = screen.getByRole('button', { name: '保存' }).closest('form');
  if (form === null) throw new Error('找不到详情表单');
  fireEvent.submit(form);
  await vi.waitFor(() => expect(onSave).toHaveBeenCalledOnce());
  return { pending, view };
}

describe('DetailDialog：迟到的保存结果', () => {
  it('保存进行中取消：旧保存完成后不再以 saved 关闭', async () => {
    const onClose = vi.fn();
    const { pending } = await startSaving(onClose);

    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(onClose).toHaveBeenCalledExactlyOnceWith('cancelled');

    await act(async () => pending.resolve());

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('保存进行中弹窗卸载：旧保存完成后不再关闭任何弹窗', async () => {
    const onClose = vi.fn();
    const { pending, view } = await startSaving(onClose);

    view.unmount();
    await act(async () => pending.resolve());

    expect(onClose).not.toHaveBeenCalled();
  });

  it('仍挂着的弹窗保存成功后以 saved 关闭', async () => {
    const onClose = vi.fn();
    const { pending } = await startSaving(onClose);

    await act(async () => pending.resolve());

    expect(onClose).toHaveBeenCalledExactlyOnceWith('saved');
  });
});
