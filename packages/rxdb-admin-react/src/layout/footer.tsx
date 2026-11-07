import type { ReactElement } from 'react';
import { useAdminShell, useAdminStore, useAdminText } from '../context.js';

/**
 * 页脚：版权信息与备案号。
 * @returns 页脚元素；布局不显示页脚时为空。
 */
export function Footer(): ReactElement | null {
  const shell = useAdminShell();
  const t = useAdminText();
  const layout = useAdminStore(shell.layout);
  const { copyright } = useAdminStore(shell.preferences);
  if (!layout.showFooter) return null;
  const company = copyright.companyName || shell.brandTitle;
  return (
    <footer className='admin-footer' data-fixed={layout.footerFixed} data-testid='admin-footer'>
      {copyright.enable && (
        <span>
          {copyright.companySiteLink ?
            <a className='link link-hover' href={copyright.companySiteLink} target='_blank' rel='noopener noreferrer'>
              {t('layout.copyright', { year: copyright.date, company })}
            </a>
          : t('layout.copyright', { year: copyright.date, company })}
        </span>
      )}
      {copyright.enable && copyright.icp && (
        <a
          className='link link-hover'
          href={copyright.icpLink || copyright.companySiteLink || undefined}
          target='_blank'
          rel='noopener noreferrer'
        >
          {copyright.icp}
        </a>
      )}
    </footer>
  );
}
