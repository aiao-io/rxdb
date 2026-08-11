import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { OPFSFileEntry } from '../utils/opfs-utils';
import { OpfsContextMenu } from './OpfsContextMenu';

const makeEntry = (kind: OPFSFileEntry['kind']): OPFSFileEntry => ({
  name: kind === 'file' ? 'note.txt' : 'docs',
  kind,
  handle: {} as FileSystemFileHandle,
  path: `/${kind === 'file' ? 'note.txt' : 'docs'}`
});

describe('OpfsContextMenu', () => {
  it('菜单项必须挂在列表容器里，而不是 li 直接塞进 div', () => {
    render(<OpfsContextMenu entry={makeEntry('file')} onAction={vi.fn()} onClose={vi.fn()} x={10} y={20} />);

    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(3);
    items.forEach(item => {
      expect(item.parentElement?.tagName).toBe('UL');
    });
  });

  it('点击菜单外的任意位置应关闭', () => {
    const onClose = vi.fn();
    render(<OpfsContextMenu entry={makeEntry('file')} onAction={vi.fn()} onClose={onClose} x={10} y={20} />);

    fireEvent.click(document.body);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('点击菜单自身不应关闭（否则动作还没触发就被吞掉）', () => {
    const onClose = vi.fn();
    const onAction = vi.fn();
    render(<OpfsContextMenu entry={makeEntry('file')} onAction={onAction} onClose={onClose} x={10} y={20} />);

    fireEvent.click(screen.getByRole('button', { name: '查看' }));

    expect(onAction).toHaveBeenCalledWith('view');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Escape 应关闭', () => {
    const onClose = vi.fn();
    render(<OpfsContextMenu entry={makeEntry('directory')} onAction={vi.fn()} onClose={onClose} x={10} y={20} />);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('卸载后不再监听全局事件', () => {
    const onClose = vi.fn();
    const { unmount } = render(
      <OpfsContextMenu entry={makeEntry('file')} onAction={vi.fn()} onClose={onClose} x={10} y={20} />
    );

    unmount();
    fireEvent.click(document.body);
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).not.toHaveBeenCalled();
  });

  it('目录条目的首项文案是"打开"而不是"查看"', () => {
    render(<OpfsContextMenu entry={makeEntry('directory')} onAction={vi.fn()} onClose={vi.fn()} x={0} y={0} />);

    expect(screen.getByRole('button', { name: '打开' })).toBeDefined();
  });
});
