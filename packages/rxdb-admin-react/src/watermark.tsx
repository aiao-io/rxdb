import type { ReactElement } from 'react';
import { useAdminShell, useAdminStore } from './context.js';

/**
 * 水印：平铺的旋转文字覆盖层，不拦截任何交互。
 * @returns 水印元素；偏好关闭或文案为空时为空。
 */
export function Watermark(): ReactElement | null {
  const shell = useAdminShell();
  const background = useAdminStore(shell.watermark);
  if (background === '') return null;
  return (
    <div
      className='admin-watermark'
      aria-hidden='true'
      data-testid='admin-watermark'
      style={{ backgroundImage: background }}
    />
  );
}
