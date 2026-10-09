import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OperationErrorAlert } from './OperationErrorAlert';

describe('OperationErrorAlert', () => {
  it('message 为 null 时不渲染', () => {
    const { container } = render(<OperationErrorAlert message={null} onClose={vi.fn()} />);

    expect(container.innerHTML).toBe('');
  });

  it('渲染 role=alert、data-testid 与文案', () => {
    render(<OperationErrorAlert message='新建失败：唯一索引冲突' onClose={vi.fn()} />);

    const alert = screen.getByRole('alert');
    expect(alert.getAttribute('data-testid')).toBe('tree-write-error');
    expect(alert.className).toContain('alert-error');
    expect(alert.textContent).toContain('新建失败：唯一索引冲突');
  });

  it('关闭按钮带可访问名称，点击触发 onClose', () => {
    const onClose = vi.fn();
    render(<OperationErrorAlert message='删除失败：x' onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: '关闭错误提示' }));

    expect(onClose).toHaveBeenCalledOnce();
  });
});
